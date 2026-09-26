/* =========================================================
   ZyrionOS SSL AGENT
   Production AWS ACM + Route53 + ALB HTTPS

   FLOW:

   Domain Agent
        ↓
   Route53 Hosted Zone
        ↓
   SSL Agent
        ↓
   ACM Certificate Discovery
        ↓
   ACM Certificate Request
        ↓
   ACM DNS Validation CNAME
        ↓
   Route53 Validation Record
        ↓
   ACM Certificate Verification
        ↓
   ALB HTTPS Listener
        ↓
   ACM Certificate Attachment
        ↓
   HTTPS Infrastructure State

   IMPORTANT:

   This agent NEVER invents:
   - certificate ARN
   - certificate ID
   - issued date
   - expiry date
   - validation state
   - ALB listener ARN
   - HTTPS readiness

   AWS ACM / Route53 / ELBv2 are the
   sources of truth.
========================================================= */


/* =========================================================
   AWS CLIENTS
========================================================= */

const {
  route53
} =
  require("../config/aws");


const {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand
} =
  require("@aws-sdk/client-acm");


const {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  GetChangeCommand
} =
  require("@aws-sdk/client-route-53");


const {
  ElasticLoadBalancingV2Client,
  DescribeListenersCommand,
  CreateListenerCommand,
  ModifyListenerCommand
} =
  require("@aws-sdk/client-elastic-load-balancing-v2");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   CONFIGURATION
========================================================= */

const AWS_REGION =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-south-1";


const acm =
  new ACMClient({

    region:
      AWS_REGION

  });


const elbv2 =
  new ElasticLoadBalancingV2Client({

    region:
      AWS_REGION

  });


/* =========================================================
   LIMITS
========================================================= */

const MAX_DOMAIN_LENGTH =
  253;


const MAX_LABEL_LENGTH =
  63;


const DEFAULT_DNS_TTL =
  300;


const DEFAULT_DNS_TIMEOUT_MS =
  Number(
    process.env.AWS_ACM_DNS_TIMEOUT_MS ||
    120000
  );


const DEFAULT_DNS_POLL_INTERVAL_MS =
  Number(
    process.env.AWS_ACM_DNS_POLL_INTERVAL_MS ||
    5000
  );


const DEFAULT_ACM_TIMEOUT_MS =
  Number(
    process.env.AWS_ACM_VALIDATION_TIMEOUT_MS ||
    15 * 60 * 1000
  );


const DEFAULT_ACM_POLL_INTERVAL_MS =
  Number(
    process.env.AWS_ACM_VALIDATION_POLL_INTERVAL_MS ||
    10000
  );


const DEFAULT_HTTPS_PORT =
  443;


/* =========================================================
   CERTIFICATE TAG
========================================================= */

const CERTIFICATE_TAG_KEY =
  "ManagedBy";


const CERTIFICATE_TAG_VALUE =
  "ZyrionOS";


/* =========================================================
   DEFAULT ALB SSL POLICY
========================================================= */

const DEFAULT_SSL_POLICY =
  process.env.AWS_ALB_SSL_POLICY ||
  "ELBSecurityPolicy-TLS13-1-2-2021-06";


/* =========================================================
   CLEAN STRING
========================================================= */

function cleanString(
  value,
  maxLength = 4000
) {

  if (
    typeof value !==
    "string"
  ) {

    return "";

  }


  return value
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   NORMALIZE DOMAIN
========================================================= */

function normalizeDomain(
  value
) {

  let domain =
    cleanString(
      value,
      MAX_DOMAIN_LENGTH
    )
      .toLowerCase();


  if (
    !domain
  ) {

    return "";

  }


  domain =
    domain.replace(
      /^https?:\/\//i,
      ""
    );


  domain =
    domain.split("/")[0];


  domain =
    domain.split("?")[0];


  domain =
    domain.split("#")[0];


  domain =
    domain.replace(
      /\.+$/,
      ""
    );


  return domain;

}


/* =========================================================
   VALIDATE DOMAIN
========================================================= */

function validateDomain(
  domain
) {

  const normalized =
    normalizeDomain(
      domain
    );


  if (
    !normalized
  ) {

    throw new Error(
      "Valid domain is required"
    );

  }


  if (
    normalized.length >
    MAX_DOMAIN_LENGTH
  ) {

    throw new Error(
      "Domain is too long"
    );

  }


  const labels =
    normalized.split(".");


  if (
    labels.length <
    2
  ) {

    throw new Error(
      "Invalid domain name"
    );

  }


  for (
    const label
    of labels
  ) {

    if (
      !label ||
      label.length >
        MAX_LABEL_LENGTH
    ) {

      throw new Error(
        "Invalid domain label"
      );

    }


    if (
      !/^[a-z0-9-]+$/i.test(
        label
      )
    ) {

      throw new Error(
        `Invalid domain label: ${label}`
      );

    }


    if (
      label.startsWith("-") ||
      label.endsWith("-")
    ) {

      throw new Error(
        `Invalid domain label: ${label}`
      );

    }

  }


  return normalized;

}


/* =========================================================
   HOSTED ZONE ID
========================================================= */

function normalizeHostedZoneId(
  value
) {

  const raw =
    cleanString(
      value,
      300
    );


  if (
    !raw
  ) {

    return "";

  }


  return raw.replace(
    /^\/hostedzone\//i,
    ""
  );

}


/* =========================================================
   VALIDATE HOSTED ZONE ID
========================================================= */

function validateHostedZoneId(
  value,
  fieldName = "hosted zone ID"
) {

  const normalized =
    normalizeHostedZoneId(
      value
    );


  if (
    !normalized
  ) {

    throw new Error(
      `${fieldName} is required`
    );

  }


  if (
    !/^Z[A-Z0-9]+$/i.test(
      normalized
    )
  ) {

    throw new Error(
      `Invalid ${fieldName}: ${normalized}`
    );

  }


  return normalized;

}


/* =========================================================
   ARN VALIDATION
========================================================= */

function validateArn(
  value,
  fieldName
) {

  const arn =
    cleanString(
      value,
      2000
    );


  if (
    !arn
  ) {

    throw new Error(
      `${fieldName} is required`
    );

  }


  if (
    !arn.startsWith(
      "arn:aws:"
    )
  ) {

    throw new Error(
      `Invalid ${fieldName}`
    );

  }


  return arn;

}


/* =========================================================
   FIND HOSTED ZONE
========================================================= */

async function findHostedZone(
  domain
) {

  const normalizedDomain =
    validateDomain(
      domain
    );


  const labels =
    normalizedDomain.split(".");


  /*
   * Search from the full domain toward
   * the root domain.
   */

  for (
    let index = 0;
    index <
      labels.length - 1;
    index++
  ) {

    const candidate =
      labels
        .slice(index)
        .join(".");


    const response =
      await route53.send(

        new ListHostedZonesByNameCommand({

          DNSName:
            `${candidate}.`,

          MaxItems:
            "100"

        })

      );


    const zone =
      response
        ?.HostedZones
        ?.find(
          (item) => {

            const zoneName =
              normalizeDomain(
                item.Name
              );


            return (
              zoneName ===
              candidate &&
              item.Config?.PrivateZone !==
                true
            );

          }
        );


    if (
      zone
    ) {

      const hostedZoneId =
        validateHostedZoneId(
          zone.Id,
          "Route53 hosted zone ID"
        );


      return {

        id:
          hostedZoneId,

        name:
          zone.Name,

        privateZone:
          false

      };

    }

  }


  throw new Error(
    `Public Route53 hosted zone not found for ${normalizedDomain}`
  );

}


/* =========================================================
   FIND EXISTING ACM CERTIFICATE
========================================================= */

async function findExistingCertificate(
  domain
) {

  let nextToken;


  do {

    const response =
      await acm.send(

        new ListCertificatesCommand({

          CertificateStatuses: [

            "PENDING_VALIDATION",

            "ISSUED",

            "INACTIVE",

            "EXPIRED",

            "VALIDATION_TIMED_OUT",

            "REVOKED",

            "FAILED"

          ],

          MaxItems:
            1000,

          ...(nextToken
            ? {
                NextToken:
                  nextToken
              }
            : {})

        })

      );


    const certificates =
      response
        ?.CertificateSummaryList ||
      [];


    const exact =
      certificates.find(
        (certificate) =>
          normalizeDomain(
            certificate.DomainName
          ) ===
          domain
      );


    if (
      exact?.CertificateArn
    ) {

      return exact;

    }


    nextToken =
      response?.NextToken;

  }
  while (
    nextToken
  );


  return null;

}


/* =========================================================
   IDEMPOTENCY TOKEN
========================================================= */

function createIdempotencyToken(
  domain
) {

  const normalized =
    domain
      .replace(
        /[^a-z0-9]/gi,
        ""
      )
      .toLowerCase();


  const token =
    normalized
      .slice(
        0,
        32
      );


  return (
    token ||
    "zyrionosssl"
  );

}


/* =========================================================
   REQUEST ACM CERTIFICATE
========================================================= */

async function requestCertificate(
  domain
) {

  const response =
    await acm.send(

      new RequestCertificateCommand({

        DomainName:
          domain,

        ValidationMethod:
          "DNS",

        IdempotencyToken:
          createIdempotencyToken(
            domain
          ),

        Tags: [

          {

            Key:
              CERTIFICATE_TAG_KEY,

            Value:
              CERTIFICATE_TAG_VALUE

          }

        ]

      })

    );


  if (
    !response?.CertificateArn
  ) {

    throw new Error(
      "AWS ACM did not return a certificate ARN"
    );

  }


  return response.CertificateArn;

}


/* =========================================================
   DESCRIBE CERTIFICATE
========================================================= */

async function describeCertificate(
  certificateArn
) {

  const response =
    await acm.send(

      new DescribeCertificateCommand({

        CertificateArn:
          certificateArn

      })

    );


  const certificate =
    response?.Certificate;


  if (
    !certificate
  ) {

    throw new Error(
      "ACM certificate details were not returned"
    );

  }


  return certificate;

}


/* =========================================================
   GET DNS VALIDATION RECORD
========================================================= */

function getDnsValidationRecord(
  certificate,
  domain
) {

  const options =
    certificate
      ?.DomainValidationOptions ||
    [];


  const normalizedDomain =
    normalizeDomain(
      domain
    );


  const exact =
    options.find(
      (option) =>
        normalizeDomain(
          option.DomainName
        ) ===
        normalizedDomain &&
        option.ValidationMethod ===
          "DNS" &&
        option.ResourceRecord
    );


  if (
    exact?.ResourceRecord
  ) {

    return exact.ResourceRecord;

  }


  const fallback =
    options.find(
      (option) =>
        option.ValidationMethod ===
          "DNS" &&
        option.ResourceRecord
    );


  return (
    fallback?.ResourceRecord ||
    null
  );

}


/* =========================================================
   VALIDATE ACM DNS RECORD
========================================================= */

function validateValidationRecord(
  record
) {

  if (
    !record
  ) {

    return {

      valid:
        false,

      error:
        "ACM DNS validation record is not available yet"

    };

  }


  if (
    !record.Name ||
    !record.Value
  ) {

    return {

      valid:
        false,

      error:
        "ACM validation record is incomplete"

    };

  }


  if (
    record.Type !==
    "CNAME"
  ) {

    return {

      valid:
        false,

      error:
        `Unexpected ACM validation record type: ${record.Type}`

    };

  }


  return {

    valid:
      true

  };

}


/* =========================================================
   UPSERT ACM VALIDATION RECORD
========================================================= */

async function upsertValidationRecord(
  hostedZoneId,
  record
) {

  const recordName =
    validateDomain(
      record.Name
    );


  const recordValue =
    cleanString(
      record.Value,
      1000
    );


  if (
    !recordValue
  ) {

    throw new Error(
      "ACM validation record value is missing"
    );

  }


  const response =
    await route53.send(

      new ChangeResourceRecordSetsCommand({

        HostedZoneId:
          hostedZoneId,

        ChangeBatch: {

          Comment:
            "ZyrionOS ACM DNS validation",

          Changes: [

            {

              Action:
                "UPSERT",

              ResourceRecordSet: {

                Name:
                  `${recordName}.`,

                Type:
                  "CNAME",

                TTL:
                  DEFAULT_DNS_TTL,

                ResourceRecords: [

                  {

                    Value:
                      recordValue

                  }

                ]

              }

            }

          ]

        }

      })

    );


  const changeInfo =
    response?.ChangeInfo;


  if (
    !changeInfo?.Id
  ) {

    throw new Error(
      "Route53 did not return ACM DNS change ID"
    );

  }


  return {

    changeId:
      changeInfo.Id,

    status:
      changeInfo.Status ||
      "PENDING",

    recordName,

    recordValue

  };

}


/* =========================================================
   GET ROUTE53 CHANGE
========================================================= */

async function getRoute53Change(
  changeId
) {

  const response =
    await route53.send(

      new GetChangeCommand({

        Id:
          changeId

      })

    );


  return {

    status:
      response
        ?.ChangeInfo
        ?.Status ||
      "UNKNOWN"

  };

}


/* =========================================================
   WAIT FOR ROUTE53 CHANGE
========================================================= */

async function waitForRoute53Change(
  changeId,
  timeoutMs =
    DEFAULT_DNS_TIMEOUT_MS,
  pollIntervalMs =
    DEFAULT_DNS_POLL_INTERVAL_MS
) {

  const startedAt =
    Date.now();


  let lastStatus =
    "UNKNOWN";


  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {

    const result =
      await getRoute53Change(
        changeId
      );


    lastStatus =
      result.status;


    if (
      lastStatus ===
      "INSYNC"
    ) {

      return {

        success:
          true,

        status:
          "INSYNC",

        timedOut:
          false,

        durationMs:
          Date.now() -
          startedAt

      };

    }


    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          pollIntervalMs
        )
    );

  }


  return {

    success:
      false,

    status:
      lastStatus,

    timedOut:
      true,

    durationMs:
      Date.now() -
      startedAt

  };

}


/* =========================================================
   WAIT FOR ACM ISSUANCE
========================================================= */

async function waitForCertificate(
  certificateArn,
  timeoutMs =
    DEFAULT_ACM_TIMEOUT_MS,
  pollIntervalMs =
    DEFAULT_ACM_POLL_INTERVAL_MS
) {

  const startedAt =
    Date.now();


  let certificate =
    await describeCertificate(
      certificateArn
    );


  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {

    const status =
      certificate.Status ||
      "UNKNOWN";


    logger.info(
      `ACM certificate state: ${status}`
    );


    if (
      status ===
      "ISSUED"
    ) {

      return {

        success:
          true,

        status,

        timedOut:
          false,

        certificate,

        durationMs:
          Date.now() -
          startedAt

      };

    }


    if (
      [
        "FAILED",
        "VALIDATION_TIMED_OUT",
        "REVOKED",
        "EXPIRED",
        "INACTIVE"
      ].includes(
        status
      )
    ) {

      return {

        success:
          false,

        status,

        timedOut:
          false,

        certificate,

        durationMs:
          Date.now() -
          startedAt

      };

    }


    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          pollIntervalMs
        )
    );


    certificate =
      await describeCertificate(
        certificateArn
      );

  }


  return {

    success:
      false,

    status:
      certificate.Status ||
      "UNKNOWN",

    timedOut:
      true,

    certificate,

    durationMs:
      Date.now() -
      startedAt

  };

}


/* =========================================================
   LOAD BALANCER INPUT
========================================================= */

function getLoadBalancerData(
  domainData
) {

  const loadBalancer =
    domainData.loadBalancer ||
    domainData.alb ||
    domainData.aws?.loadBalancer ||
    domainData.aws?.alb ||
    {};


  const loadBalancerArn =
    domainData.loadBalancerArn ||
    loadBalancer.arn ||
    loadBalancer.loadBalancerArn ||
    domainData.aws?.loadBalancerArn ||
    domainData.aws?.albArn ||
    "";


  const targetGroupArn =
    domainData.targetGroupArn ||
    loadBalancer.targetGroupArn ||
    loadBalancer.targetGroup ||
    domainData.aws?.targetGroupArn ||
    domainData.aws?.albTargetGroupArn ||
    "";


  const existingHttpsListenerArn =
    domainData.httpsListenerArn ||
    loadBalancer.httpsListenerArn ||
    domainData.aws?.httpsListenerArn ||
    "";


  return {

    loadBalancerArn:
      loadBalancerArn
        ? validateArn(
            loadBalancerArn,
            "load balancer ARN"
          )
        : "",

    targetGroupArn:
      targetGroupArn
        ? validateArn(
            targetGroupArn,
            "target group ARN"
          )
        : "",

    existingHttpsListenerArn:
      existingHttpsListenerArn
        ? validateArn(
            existingHttpsListenerArn,
            "HTTPS listener ARN"
          )
        : ""

  };

}


/* =========================================================
   FIND HTTPS LISTENER
========================================================= */

async function findHttpsListener(
  loadBalancerArn
) {

  let marker;


  do {

    const response =
      await elbv2.send(

        new DescribeListenersCommand({

          LoadBalancerArn:
            loadBalancerArn,

          PageSize:
            100,

          ...(marker
            ? {
                Marker:
                  marker
              }
            : {})

        })

      );


    const listeners =
      response?.Listeners ||
      [];


    const httpsListener =
      listeners.find(
        (listener) =>
          listener.Protocol ===
            "HTTPS" &&
          Number(
            listener.Port
          ) ===
            DEFAULT_HTTPS_PORT
      );


    if (
      httpsListener
    ) {

      return httpsListener;

    }


    marker =
      response?.NextMarker;

  }
  while (
    marker
  );


  return null;

}


/* =========================================================
   CREATE HTTPS LISTENER
========================================================= */

async function createHttpsListener(
  data
) {

  const response =
    await elbv2.send(

      new CreateListenerCommand({

        LoadBalancerArn:
          data.loadBalancerArn,

        Protocol:
          "HTTPS",

        Port:
          DEFAULT_HTTPS_PORT,

        Certificates: [

          {

            CertificateArn:
              data.certificateArn

          }

        ],

        SslPolicy:
          data.sslPolicy,

        DefaultActions: [

          {

            Type:
              "forward",

            TargetGroupArn:
              data.targetGroupArn

          }

        ]

      })

    );


  const listener =
    response?.Listeners?.[0];


  if (
    !listener?.ListenerArn
  ) {

    throw new Error(
      "ALB HTTPS listener was not returned by AWS"
    );

  }


  return listener;

}


/* =========================================================
   UPDATE HTTPS LISTENER
========================================================= */

async function updateHttpsListener(
  listenerArn,
  certificateArn,
  sslPolicy
) {

  const response =
    await elbv2.send(

      new ModifyListenerCommand({

        ListenerArn:
          listenerArn,

        Certificates: [

          {

            CertificateArn:
              certificateArn

          }

        ],

        ...(sslPolicy
          ? {
              SslPolicy:
                sslPolicy
            }
          : {})

      })

    );


  const listener =
    response?.Listeners?.[0];


  if (
    !listener?.ListenerArn
  ) {

    throw new Error(
      "ALB HTTPS listener update did not return listener ARN"
    );

  }


  return listener;

}


/* =========================================================
   VERIFY LISTENER CERTIFICATE
========================================================= */

function listenerHasCertificate(
  listener,
  certificateArn
) {

  if (
    !listener ||
    !certificateArn
  ) {

    return false;

  }


  const defaultCertificate =
    listener
      ?.Certificates
      ?.find(
        (certificate) =>
          certificate.IsDefault ===
          true
      );


  if (
    defaultCertificate?.CertificateArn ===
    certificateArn
  ) {

    return true;

  }


  return (
    listener
      ?.Certificates
      ?.some(
        (certificate) =>
          certificate.CertificateArn ===
          certificateArn
      ) ||
    false
  );

}


/* =========================================================
   BUILD SECURITY INFO
========================================================= */

function buildSecurityInfo(
  certificate,
  sslPolicy
) {

  return {

    certificateManagedBy:
      "AWS ACM",

    validationMethod:
      certificate.ValidationMethod ||
      "DNS",

    keyAlgorithm:
      certificate.KeyAlgorithm ||
      null,

    signatureAlgorithm:
      certificate.SignatureAlgorithm ||
      null,

    transparencyLogging:
      certificate.CertificateTransparencyLoggingPreference ||
      null,

    tlsPolicy:
      sslPolicy ||
      null,

    hsts:
      null,

    securityHeaders:
      null

  };

}


/* =========================================================
   SSL AGENT
========================================================= */

async function sslAgent(
  domainData = {}
) {

  let currentStage =
    "request-validation";


  const startedAt =
    Date.now();


  try {

    logger.info(
      "🔐 ZyrionOS SSL Agent Started"
    );


    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    if (
      !domainData ||
      typeof domainData !==
        "object" ||
      Array.isArray(
        domainData
      )
    ) {

      return {

        success:
          false,

        message:
          "Domain data required",

        stage:
          currentStage

      };

    }


    const rawDomain =
      domainData.hostname ||
      domainData.domain ||
      domainData.fullDomain ||
      domainData.domain?.hostname ||
      "";


    const domain =
      validateDomain(
        rawDomain
      );


    /* =====================================================
       REGION
    ===================================================== */

    currentStage =
      "configuration-validation";


    if (
      !process.env.AWS_REGION &&
      !process.env.AWS_DEFAULT_REGION
    ) {

      logger.warning(
        "AWS_REGION is not explicitly configured; using ap-south-1 fallback."
      );

    }


    /* =====================================================
       LOAD BALANCER
    ===================================================== */

    currentStage =
      "load-balancer-validation";


    const loadBalancer =
      getLoadBalancerData(
        domainData
      );


    /*
     * SSL can request/validate an ACM certificate
     * without an ALB.
     *
     * But HTTPS cannot become active without
     * an ALB listener.
     */

    const hasLoadBalancer =
      Boolean(
        loadBalancer.loadBalancerArn
      );


    /* =====================================================
       HOSTED ZONE
    ===================================================== */

    currentStage =
      "route53-hosted-zone";


    const hostedZone =
      await findHostedZone(
        domain
      );


    logger.success(
      `Route53 Hosted Zone Found: ${hostedZone.name}`
    );


    /* =====================================================
       CERTIFICATE DISCOVERY
    ===================================================== */

    currentStage =
      "acm-certificate-discovery";


    let certificateSummary =
      await findExistingCertificate(
        domain
      );


    let certificateArn =
      certificateSummary
        ?.CertificateArn ||
      null;


    let certificateAction =
      certificateArn
        ? "existing"
        : "requested";


    /* =====================================================
       REQUEST CERTIFICATE
    ===================================================== */

    if (
      !certificateArn
    ) {

      currentStage =
        "acm-certificate-request";


      certificateArn =
        await requestCertificate(
          domain
        );


      logger.success(
        `ACM Certificate Requested: ${certificateArn}`
      );

    }


    /* =====================================================
       CERTIFICATE DESCRIPTION
    ===================================================== */

    currentStage =
      "acm-certificate-description";


    let certificate =
      await describeCertificate(
        certificateArn
      );


    /* =====================================================
       REGION VERIFICATION
    ===================================================== */

    const certificateArnRegion =
      certificateArn
        .split(":")[3];


    if (
      certificateArnRegion &&
      certificateArnRegion !==
        AWS_REGION
    ) {

      throw new Error(
        `ACM certificate is in ${certificateArnRegion}, but deployment region is ${AWS_REGION}`
      );

    }


    /* =====================================================
       DOMAIN VERIFICATION
    ===================================================== */

    if (
      normalizeDomain(
        certificate.DomainName
      ) !==
      domain
    ) {

      throw new Error(
        "ACM certificate domain does not match requested domain"
      );

    }


    /* =====================================================
       DNS VALIDATION RECORD
    ===================================================== */

    currentStage =
      "acm-dns-validation";


    const validationRecord =
      getDnsValidationRecord(
        certificate,
        domain
      );


    const validation =
      validateValidationRecord(
        validationRecord
      );


    let dnsChange =
      null;


    let route53Validation =
      null;


    /* =====================================================
       ROUTE53 VALIDATION RECORD
    ===================================================== */

    if (
      validation.valid
    ) {

      currentStage =
        "route53-acm-validation-record";


      dnsChange =
        await upsertValidationRecord(

          hostedZone.id,

          validationRecord

        );


      logger.success(
        "ACM DNS Validation Record Published"
      );


      currentStage =
        "route53-acm-change-verification";


      route53Validation =
        await waitForRoute53Change(

          dnsChange.changeId,

          Number(
            domainData.dnsVerificationTimeoutMs ||
            DEFAULT_DNS_TIMEOUT_MS
          ),

          Number(
            domainData.dnsVerificationPollIntervalMs ||
            DEFAULT_DNS_POLL_INTERVAL_MS
          )

        );

    }


    /* =====================================================
       REFRESH CERTIFICATE
    ===================================================== */

    currentStage =
      "acm-status-verification";


    certificate =
      await describeCertificate(
        certificateArn
      );


    let certificateStatus =
      certificate.Status ||
      "UNKNOWN";


    /* =====================================================
       WAIT FOR ACM ISSUANCE
    ===================================================== */

    const shouldWaitForCertificate =
      domainData.waitForCertificate ===
        true ||
      process.env.AWS_ACM_WAIT_FOR_ISSUANCE ===
        "true";


    let issuance =
      null;


    if (
      certificateStatus ===
        "PENDING_VALIDATION" &&
      shouldWaitForCertificate
    ) {

      currentStage =
        "acm-certificate-issuance";


      issuance =
        await waitForCertificate(

          certificateArn,

          Number(
            domainData.acmValidationTimeoutMs ||
            DEFAULT_ACM_TIMEOUT_MS
          ),

          Number(
            domainData.acmValidationPollIntervalMs ||
            DEFAULT_ACM_POLL_INTERVAL_MS
          )

        );


      certificate =
        issuance.certificate;


      certificateStatus =
        certificate.Status ||
        "UNKNOWN";

    }


    /* =====================================================
       CERTIFICATE STATES
    ===================================================== */

    const isIssued =
      certificateStatus ===
      "ISSUED";


    const isPending =
      certificateStatus ===
      "PENDING_VALIDATION";


    const isFailed =
      [

        "FAILED",
        "VALIDATION_TIMED_OUT",
        "REVOKED",
        "EXPIRED",
        "INACTIVE"

      ].includes(
        certificateStatus
      );


    /* =====================================================
       CERTIFICATE DATES
    ===================================================== */

    const issuedAt =
      certificate.IssuedAt ||
      null;


    const notAfter =
      certificate.NotAfter ||
      null;


    let remainingDays =
      null;


    if (
      notAfter
    ) {

      remainingDays =
        Math.max(

          0,

          Math.ceil(

            (
              new Date(
                notAfter
              ).getTime() -
              Date.now()
            ) /
            (
              24 *
              60 *
              60 *
              1000
            )

          )

        );

    }


    /* =====================================================
       SSL POLICY
    ===================================================== */

    const sslPolicy =
      cleanString(
        domainData.sslPolicy ||
        process.env.AWS_ALB_SSL_POLICY ||
        DEFAULT_SSL_POLICY,
        300
      );


    /* =====================================================
       HTTPS LISTENER
    ===================================================== */

    let listener =
      null;


    let listenerAction =
      "not_configured";


    let httpsEnabled =
      false;


    if (
      isIssued &&
      hasLoadBalancer
    ) {

      currentStage =
        "alb-https-listener-discovery";


      listener =
        loadBalancer.existingHttpsListenerArn
          ? null
          : await findHttpsListener(
              loadBalancer.loadBalancerArn
            );


      if (
        loadBalancer.existingHttpsListenerArn
      ) {

        /*
         * Caller supplied an authoritative
         * listener ARN. Describe it through
         * the load balancer using ARN.
         */

        const response =
          await elbv2.send(

            new DescribeListenersCommand({

              ListenerArns: [

                loadBalancer
                  .existingHttpsListenerArn

              ]

            })

          );


        listener =
          response
            ?.Listeners?.[0] ||
          null;

      }


      if (
        listener
      ) {

        currentStage =
          "alb-https-listener-update";


        listener =
          await updateHttpsListener(

            listener.ListenerArn,

            certificateArn,

            sslPolicy

          );


        listenerAction =
          "updated";

      }

      else {

        if (
          !loadBalancer.targetGroupArn
        ) {

          throw new Error(
            "ALB HTTPS listener does not exist and targetGroupArn is required to create one"
          );

        }


        currentStage =
          "alb-https-listener-create";


        listener =
          await createHttpsListener({

            loadBalancerArn:
              loadBalancer.loadBalancerArn,

            targetGroupArn:
              loadBalancer.targetGroupArn,

            certificateArn,

            sslPolicy

          });


        listenerAction =
          "created";

      }


      httpsEnabled =
        Boolean(
          listener?.ListenerArn &&
          listener.Protocol ===
            "HTTPS" &&
          Number(
            listener.Port
          ) ===
            DEFAULT_HTTPS_PORT &&
          listenerHasCertificate(
            listener,
            certificateArn
          )
        );

    }


    /* =====================================================
       SSL STATUS
    ===================================================== */

    let sslStatus =
      "pending";


    if (
      isIssued &&
      httpsEnabled
    ) {

      sslStatus =
        "active";

    }

    else if (
      isFailed
    ) {

      sslStatus =
        "failed";

    }

    else if (
      isIssued &&
      !hasLoadBalancer
    ) {

      sslStatus =
        "certificate_issued";

    }

    else if (
      isIssued &&
      hasLoadBalancer &&
      !httpsEnabled
    ) {

      sslStatus =
        "listener_pending";

    }

    else if (
      isPending
    ) {

      sslStatus =
        "pending_validation";

    }


    /* =====================================================
       AUTO RENEWAL
    ===================================================== */

    const autoRenew =
      certificate.ValidationMethod ===
      "DNS";


    /* =====================================================
       SECURITY
    ===================================================== */

    const security =
      buildSecurityInfo(
        certificate,
        sslPolicy
      );


    /* =====================================================
       URL STATE
    ===================================================== */

    const securedUrl =
      httpsEnabled
        ? `https://${domain}`
        : null;


    /* =====================================================
       FINAL SSL OBJECT
    ===================================================== */

    const ssl = {

      certificateArn,

      certificateId:
        certificate.CertificateArn ||
        certificateArn,

      domainName:
        certificate.DomainName,

      subjectAlternativeNames:
        certificate.SubjectAlternativeNames ||
        [],

      provider:
        "AWS ACM",

      region:
        AWS_REGION,

      enabled:
        isIssued,

      httpsEnabled,

      sslStatus,

      validationStatus:
        certificateStatus,

      validationMethod:
        certificate.ValidationMethod ||
        "DNS",

      certificateAction,

      autoRenew,

      renewalEligibility:
        certificate.RenewalEligibility ||
        null,

      issuedAt,

      expiresAt:
        notAfter,

      remainingDays,

      securedUrl

    };


    /* =====================================================
       FINAL DATA
    ===================================================== */

    const sslData = {

      ssl,

      dnsValidation: {

        required:
          true,

        configured:
          validation.valid,

        recordType:
          validationRecord
            ?.Type ||
          null,

        recordName:
          validationRecord
            ?.Name ||
          null,

        recordValue:
          validationRecord
            ?.Value ||
          null,

        route53HostedZoneId:
          hostedZone.id,

        route53ChangeId:
          dnsChange?.changeId ||
          null,

        route53ChangeStatus:
          dnsChange?.status ||
          null,

        route53Verified:
          route53Validation?.success ||
          false

      },

      alb: {

        configured:
          hasLoadBalancer,

        loadBalancerArn:
          loadBalancer.loadBalancerArn ||
          null,

        targetGroupArn:
          loadBalancer.targetGroupArn ||
          null,

        listenerArn:
          listener?.ListenerArn ||
          loadBalancer.existingHttpsListenerArn ||
          null,

        listenerProtocol:
          listener?.Protocol ||
          null,

        listenerPort:
          listener?.Port ||
          null,

        listenerAction,

        certificateAttached:
          httpsEnabled,

        sslPolicy:
          listener?.SslPolicy ||
          sslPolicy

      },

      sslReady:
        isIssued,

      httpsReady:
        httpsEnabled,

      fullyReady:
        isIssued &&
        httpsEnabled,

      certificateStatus,

      createdAt:
        new Date().toISOString(),

      durationMs:
        Date.now() -
        startedAt

    };


    /* =====================================================
       LOGGING
    ===================================================== */

    if (
      isIssued &&
      httpsEnabled
    ) {

      logger.success(
        `🔐 HTTPS ACTIVE: https://${domain}`
      );

    }

    else if (
      isIssued
    ) {

      logger.success(
        `🔐 ACM Certificate ISSUED: ${domain}`
      );


      logger.warning(
        "Certificate is issued but HTTPS listener is not verified as active."
      );

    }

    else if (
      isPending
    ) {

      logger.info(
        `🔐 ACM Certificate Pending Validation: ${domain}`
      );

    }

    else {

      logger.warning(
        `🔐 ACM Certificate State: ${certificateStatus}`
      );

    }


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        !isFailed,

      message:
        isIssued &&
        httpsEnabled

          ? "SSL certificate is issued and HTTPS listener is active."

          : isIssued

            ? "SSL certificate is issued, but HTTPS listener is not active."

            : "SSL certificate is not yet active.",

      ...sslData

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown SSL Agent error";


    logger.error(
      `SSL Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success:
        false,

      message:
        "SSL activation failed",

      error:
        errorMessage,

      stage:
        currentStage,

      durationMs:
        Date.now() -
        startedAt

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  sslAgent;
