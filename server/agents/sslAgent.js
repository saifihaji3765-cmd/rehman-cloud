/* =========================================================
   ZyrionOS SSL AGENT
   Real AWS ACM Certificate Management

   FLOW:

   Domain Agent
        ↓
   Route53 Hosted Zone
        ↓
   SSL Agent
        ↓
   AWS ACM Certificate Request
        ↓
   ACM DNS Validation
        ↓
   Route53 Validation CNAME
        ↓
   ACM Validation
        ↓
   Certificate ISSUED
        ↓
   ALB HTTPS Listener

   IMPORTANT:

   This agent NEVER invents:
   - certificate ARN
   - certificate ID
   - issued date
   - expiry date
   - validated state
   - active SSL state

   ACM is the source of truth.
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
  ChangeResourceRecordSetsCommand
} =
  require("@aws-sdk/client-route-53");


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


/* =========================================================
   LIMITS
========================================================= */

const MAX_DOMAIN_LENGTH =
  253;


/* =========================================================
   CERTIFICATE TAG
========================================================= */

const CERTIFICATE_TAG_KEY =
  "ManagedBy";


const CERTIFICATE_TAG_VALUE =
  "ZyrionOS";


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


  /*
   * Remove protocol.
   */

  domain =
    domain.replace(
      /^https?:\/\//i,
      ""
    );


  /*
   * Remove path.
   */

  domain =
    domain.split("/")[0];


  /*
   * Remove query/hash.
   */

  domain =
    domain.split("?")[0];

  domain =
    domain.split("#")[0];


  /*
   * Remove trailing dot.
   */

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
    const label of labels
  ) {

    if (
      !label ||
      label.length >
        63
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
   FIND HOSTED ZONE
========================================================= */

async function findHostedZone(
  domain
) {

  const normalizedDomain =
    validateDomain(
      domain
    );


  /*
   * Walk up the domain hierarchy
   * until the authoritative hosted zone
   * is found.
   *
   * Example:
   *
   * app.project.zyrionos.com
   *
   * tries:
   *
   * app.project.zyrionos.com
   * project.zyrionos.com
   * zyrionos.com
   */

  const labels =
    normalizedDomain.split(".");


  for (
    let index = 0;
    index < labels.length - 1;
    index++
  ) {

    const candidate =
      labels
        .slice(index)
        .join(".");


    const response =
      await route53.send(

        new (
          require(
            "@aws-sdk/client-route-53"
          )
            .ListHostedZonesByNameCommand
        )({

          DNSName:
            `${candidate}.`,

          MaxItems:
            "20"

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
        zone.Id
          ?.replace(
            /^\/hostedzone\//,
            ""
          );


      if (
        !hostedZoneId
      ) {

        throw new Error(
          `Route53 hosted zone ID missing for ${candidate}`
        );

      }


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

            "EXPIRED"

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
      response?.CertificateSummaryList ||
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

        /*
         * Do NOT automatically request
         * wildcard certificates.
         */

        Tags: [

          {

            Key:
              CERTIFICATE_TAG_KEY,

            Value:
              CERTIFICATE_TAG_VALUE

          }

        ],

        /*
         * ACM creates the validation
         * records that we then publish
         * through Route53.
         */

        IdempotencyToken:
          createIdempotencyToken(
            domain
          )

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
   IDEMPOTENCY TOKEN
========================================================= */

function createIdempotencyToken(
  domain
) {

  /*
   * ACM idempotency token:
   * 1-32 characters
   * alphanumeric only
   */

  const normalized =
    domain
      .replace(
        /[^a-z0-9]/gi,
        ""
      )
      .toLowerCase();


  return (
    normalized
      .slice(
        0,
        32
      ) ||
    "zyrionosssl"
  );

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
   FIND VALIDATION OPTIONS
========================================================= */

function getDnsValidationOptions(
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


  /*
   * Prefer exact domain validation.
   */

  const exact =
    options.find(
      (option) =>
        normalizeDomain(
          option.DomainName
        ) ===
        normalizedDomain &&
        option.ResourceRecord
    );


  if (
    exact?.ResourceRecord
  ) {

    return exact.ResourceRecord;

  }


  /*
   * Fallback to the first DNS
   * validation record.
   */

  const dnsOption =
    options.find(
      (option) =>
        option.ValidationMethod ===
          "DNS" &&
        option.ResourceRecord
    );


  return (
    dnsOption?.ResourceRecord ||
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
        "ACM DNS validation record not available yet"

    };

  }


  if (
    !record.Name ||
    !record.Type ||
    !record.Value
  ) {

    return {

      valid:
        false,

      error:
        "ACM returned an incomplete DNS validation record"

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
    cleanString(
      record.Name,
      253
    );


  const recordValue =
    cleanString(
      record.Value,
      1000
    );


  if (
    !recordName ||
    !recordValue
  ) {

    throw new Error(
      "ACM validation DNS record is incomplete"
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
                  recordName,

                Type:
                  "CNAME",

                TTL:
                  300,

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
      "PENDING"

  };

}


/* =========================================================
   BUILD SECURITY INFORMATION
========================================================= */

function buildSecurityInfo(
  certificate
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

    /*
     * HSTS and security headers are
     * application / load-balancer
     * configuration, NOT certificate
     * properties.
     */

    hsts:
      null,

    securityHeaders:
      null,

    tlsPolicy:
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
        "object"
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


    /*
     * Accept:
     *
     * fullDomain
     * hostname
     * domain
     */

    const rawDomain =
      domainData.hostname ||
      domainData.domain ||
      domainData.fullDomain ||
      "";


    const domain =
      validateDomain(
        rawDomain
      );


    /* =====================================================
       CONFIGURATION
    ===================================================== */

    currentStage =
      "configuration-validation";


    if (
      !process.env.AWS_REGION &&
      !process.env.AWS_DEFAULT_REGION
    ) {

      logger.warning(
        "AWS_REGION is not explicitly configured; default region is being used."
      );

    }


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
       FIND EXISTING CERTIFICATE
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
      "existing";


    /* =====================================================
       REQUEST NEW CERTIFICATE
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


      certificateAction =
        "requested";


      logger.success(
        `ACM Certificate Requested: ${certificateArn}`
      );

    }


    /* =====================================================
       DESCRIBE CERTIFICATE
    ===================================================== */

    currentStage =
      "acm-certificate-description";


    let certificate =
      await describeCertificate(
        certificateArn
      );


    /*
     * Make sure certificate actually
     * belongs to requested domain.
     */

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


    let validationRecord =
      getDnsValidationOptions(
        certificate,
        domain
      );


    const validation =
      validateValidationRecord(
        validationRecord
      );


    /* =====================================================
       PUBLISH VALIDATION RECORD
    ===================================================== */

    let dnsChange =
      null;


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

    }


    /* =====================================================
       REFRESH CERTIFICATE STATE
    ===================================================== */

    currentStage =
      "acm-status-verification";


    certificate =
      await describeCertificate(
        certificateArn
      );


    const certificateStatus =
      certificate.Status ||
      "UNKNOWN";


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
       SSL STATE
    ===================================================== */

    let sslStatus =
      "pending";


    if (
      isIssued
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
      isPending
    ) {

      sslStatus =
        "pending_validation";

    }


    /* =====================================================
       HTTPS STATE
    ===================================================== */

    /*
     * A certificate being ISSUED does NOT
     * automatically create an HTTPS listener.
     *
     * ALB HTTPS listener configuration is
     * a separate infrastructure operation.
     */

    const httpsEnabled =
      false;


    /* =====================================================
       AUTO RENEWAL
    ===================================================== */

    /*
     * ACM-managed DNS validation supports
     * managed renewal when the validation
     * CNAME remains available.
     */

    const autoRenew =
      (
        certificate.ValidationMethod ===
        "DNS"
      );


    /* =====================================================
       SECURITY
    ===================================================== */

    const security =
      buildSecurityInfo(
        certificate
      );


    /* =====================================================
       SSL OBJECT
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

      securedUrl:
        isIssued
          ? `https://${domain}`
          : null

    };


    /* =====================================================
       RESULT
    ===================================================== */

    const sslData = {

      ssl,

      security,

      dnsValidation: {

        required:
          true,

        configured:
          validation.valid,

        recordType:
          validationRecord
            ?.Type ||
          "CNAME",

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
          null

      },

      sslReady:
        isIssued,

      certificateStatus,

      createdAt:
        new Date().toISOString()

    };


    /* =====================================================
       LOG
    ===================================================== */

    if (
      isIssued
    ) {

      logger.success(
        `🔐 SSL Certificate ISSUED: ${domain}`
      );

    }

    else if (
      isPending
    ) {

      logger.info(
        `🔐 SSL Certificate Pending Validation: ${domain}`
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
        isIssued
          ? "SSL certificate is issued by AWS ACM"
          : "SSL certificate request is not yet active",

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
        currentStage

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  sslAgent;
