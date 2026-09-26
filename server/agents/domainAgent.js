/* =========================================================
   ZyrionOS DOMAIN AGENT
   Production AWS Route53 Domain Management

   FLOW:

   AWS Agent
        ↓
   ALB / Load Balancer
        ↓
   Domain Agent
        ↓
   Route53 Hosted Zone Verification
        ↓
   DNS Alias UPSERT
        ↓
   Route53 Change Verification
        ↓
   Domain Routing State
        ↓
   SSL Agent
        ↓
   ACM Certificate
        ↓
   HTTPS

   IMPORTANT:

   Domain Agent DOES:
   - validate domain
   - verify public Route53 hosted zone
   - validate ALB target
   - create/update Route53 alias
   - verify Route53 change state
   - return authoritative DNS state

   Domain Agent DOES NOT:
   - create SSL certificates
   - claim HTTPS is active
   - invent public URLs
   - claim external DNS propagation
   - create an ALB itself
   - modify nameservers
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const {
  v4: uuidv4
} =
  require("uuid");


/* =========================================================
   AWS ROUTE53 CLIENT
========================================================= */

const {
  route53
} =
  require("../config/aws");


/* =========================================================
   AWS ROUTE53 COMMANDS
========================================================= */

const {
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
  GetChangeCommand,
  ListResourceRecordSetsCommand
} =
  require("@aws-sdk/client-route-53");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   RESERVED SUBDOMAINS
========================================================= */

const RESERVED_SUBDOMAINS =
  new Set([

    "admin",
    "api",
    "dashboard",
    "root",
    "zyrionos",
    "vertexcloud",
    "support",
    "billing",
    "mail",
    "ftp",
    "app",
    "www",
    "auth",
    "login",
    "cdn",
    "static",
    "assets",
    "status",
    "dev",
    "staging",
    "production"

  ]);


/* =========================================================
   LIMITS
========================================================= */

const MAX_PROJECT_NAME_LENGTH =
  50;


const MAX_DOMAIN_LENGTH =
  253;


const MAX_LABEL_LENGTH =
  63;


const MAX_DEPLOYMENT_ID_LENGTH =
  100;


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


  /*
   * Remove protocol.
   */

  domain =
    domain.replace(
      /^https?:\/\//i,
      ""
    );


  /*
   * Remove path/query/hash.
   */

  domain =
    domain.split("/")[0];

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
   DOMAIN LABEL VALIDATION
========================================================= */

function validateDomainLabels(
  domain
) {

  const labels =
    domain.split(".");


  if (
    labels.length <
    2
  ) {

    throw new Error(
      "Invalid domain: at least two labels are required"
    );

  }


  for (
    const label
    of labels
  ) {

    if (
      !label
    ) {

      throw new Error(
        "Invalid domain label"
      );

    }


    if (
      label.length >
      MAX_LABEL_LENGTH
    ) {

      throw new Error(
        `Domain label exceeds ${MAX_LABEL_LENGTH} characters`
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


  return true;

}


/* =========================================================
   VALIDATE ROOT DOMAIN
========================================================= */

function validateRootDomain(
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
      "APP_DOMAIN is required"
    );

  }


  if (
    normalized.length >
    MAX_DOMAIN_LENGTH
  ) {

    throw new Error(
      "Root domain is too long"
    );

  }


  validateDomainLabels(
    normalized
  );


  return normalized;

}


/* =========================================================
   VALIDATE HOSTNAME
========================================================= */

function validateHostname(
  hostname
) {

  const normalized =
    normalizeDomain(
      hostname
    );


  if (
    !normalized
  ) {

    throw new Error(
      "Hostname is required"
    );

  }


  if (
    normalized.length >
    MAX_DOMAIN_LENGTH
  ) {

    throw new Error(
      "Hostname is too long"
    );

  }


  validateDomainLabels(
    normalized
  );


  return normalized;

}


/* =========================================================
   CLEAN PROJECT NAME
========================================================= */

function cleanProjectName(
  name
) {

  let cleaned =
    cleanString(
      name,
      MAX_PROJECT_NAME_LENGTH
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9-]+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );


  if (
    !cleaned
  ) {

    cleaned =
      "app";

  }


  if (
    cleaned.length >
    MAX_LABEL_LENGTH
  ) {

    cleaned =
      cleaned.slice(
        0,
        MAX_LABEL_LENGTH
      );


    cleaned =
      cleaned.replace(
        /-+$/,
        ""
      );

  }


  return cleaned;

}


/* =========================================================
   DEPLOYMENT ID
========================================================= */

function normalizeDeploymentId(
  value
) {

  const deploymentId =
    cleanString(
      value,
      MAX_DEPLOYMENT_ID_LENGTH
    );


  if (
    !deploymentId
  ) {

    return uuidv4();

  }


  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      deploymentId
    )
  ) {

    throw new Error(
      "Invalid deployment ID"
    );

  }


  return deploymentId;

}


/* =========================================================
   SHORT DEPLOYMENT ID
========================================================= */

function shortDeploymentId(
  deploymentId
) {

  const shortId =
    deploymentId
      .replace(
        /[^a-zA-Z0-9-]/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .toLowerCase()
      .slice(
        0,
        16
      );


  if (
    !shortId
  ) {

    return "deployment";

  }


  return shortId;

}


/* =========================================================
   CREATE SUBDOMAIN
========================================================= */

function createSubdomain(
  projectName,
  deploymentId
) {

  let baseName =
    cleanProjectName(
      projectName
    );


  const shortId =
    shortDeploymentId(
      deploymentId
    );


  /*
   * Reserved names are never used
   * directly.
   */

  if (
    RESERVED_SUBDOMAINS.has(
      baseName
    )
  ) {

    baseName =
      `project-${baseName}`;

  }


  const suffix =
    `-${shortId}`;


  const maxBaseLength =
    MAX_LABEL_LENGTH -
    suffix.length;


  if (
    maxBaseLength <
    1
  ) {

    throw new Error(
      "Deployment ID is too long for DNS label"
    );

  }


  baseName =
    baseName
      .slice(
        0,
        maxBaseLength
      )
      .replace(
        /-+$/,
        ""
      );


  if (
    !baseName
  ) {

    baseName =
      "app";

  }


  const subdomain =
    `${baseName}${suffix}`;


  if (
    subdomain.length >
    MAX_LABEL_LENGTH
  ) {

    throw new Error(
      "Generated subdomain is too long"
    );

  }


  validateDomainLabels(
    `${subdomain}.example.com`
  );


  return subdomain;

}


/* =========================================================
   BUILD HOSTNAME
========================================================= */

function buildHostname(
  subdomain,
  rootDomain
) {

  const hostname =
    `${subdomain}.${rootDomain}`;


  return validateHostname(
    hostname
  );

}


/* =========================================================
   BUILD HTTP URL
========================================================= */

function buildHttpUrl(
  hostname
) {

  return `http://${hostname}`;

}


/* =========================================================
   BUILD HTTPS URL
========================================================= */

function buildHttpsUrl(
  hostname
) {

  return `https://${hostname}`;

}


/* =========================================================
   NORMALIZE HOSTED ZONE ID
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
   FIND HOSTED ZONE
========================================================= */

async function findHostedZone(
  rootDomain
) {

  const normalizedRoot =
    validateRootDomain(
      rootDomain
    );


  const response =
    await route53.send(

      new ListHostedZonesByNameCommand({

        DNSName:
          `${normalizedRoot}.`,

        MaxItems:
          "100"

      })

    );


  const zones =
    response?.HostedZones ||
    [];


  const exactZone =
    zones.find(
      (zone) => {

        const zoneName =
          normalizeDomain(
            zone.Name
          );


        return (
          zoneName ===
          normalizedRoot
        );

      }
    );


  if (
    !exactZone
  ) {

    throw new Error(
      `Route53 hosted zone not found for ${normalizedRoot}`
    );

  }


  /*
   * This agent manages public DNS.
   */

  if (
    exactZone.Config?.PrivateZone
  ) {

    throw new Error(
      `Route53 zone ${normalizedRoot} is a private hosted zone`
    );

  }


  const hostedZoneId =
    validateHostedZoneId(
      exactZone.Id,
      "Route53 hosted zone ID"
    );


  return {

    id:
      hostedZoneId,

    name:
      exactZone.Name,

    privateZone:
      false,

    resourceRecordSetCount:
      exactZone.ResourceRecordSetCount ||
      null

  };

}


/* =========================================================
   LOAD BALANCER INPUT
========================================================= */

function getLoadBalancerTarget(
  projectData
) {

  const loadBalancer =
    projectData.loadBalancer ||
    projectData.alb ||
    projectData.aws?.loadBalancer ||
    projectData.aws?.alb ||
    {};


  const dnsName =
    projectData.loadBalancerDnsName ||
    loadBalancer.dnsName ||
    loadBalancer.DNSName ||
    loadBalancer.dns ||
    projectData.aws?.loadBalancerDnsName ||
    projectData.aws?.albDnsName ||
    "";


  const hostedZoneId =
    projectData.loadBalancerHostedZoneId ||
    loadBalancer.hostedZoneId ||
    loadBalancer.canonicalHostedZoneId ||
    loadBalancer.CanonicalHostedZoneId ||
    loadBalancer.zoneId ||
    projectData.aws?.loadBalancerHostedZoneId ||
    projectData.aws?.albHostedZoneId ||
    "";


  return {

    dnsName:
      normalizeDomain(
        dnsName
      ),

    hostedZoneId:
      normalizeHostedZoneId(
        hostedZoneId
      )

  };

}


/* =========================================================
   VALIDATE ALB TARGET
========================================================= */

function validateLoadBalancerTarget(
  target
) {

  if (
    !target ||
    typeof target !==
      "object"
  ) {

    return {

      valid:
        false,

      error:
        "Load balancer target not provided"

    };

  }


  if (
    !target.dnsName
  ) {

    return {

      valid:
        false,

      error:
        "Load balancer DNS name not provided"

    };

  }


  if (
    !target.hostedZoneId
  ) {

    return {

      valid:
        false,

      error:
        "Load balancer hosted zone ID not provided"

    };

  }


  if (
    target.dnsName.length >
    MAX_DOMAIN_LENGTH
  ) {

    return {

      valid:
        false,

      error:
        "Load balancer DNS name is too long"

    };

  }


  try {

    validateHostname(
      target.dnsName
    );

  }

  catch (error) {

    return {

      valid:
        false,

      error:
        `Invalid load balancer DNS name: ${error.message}`

    };

  }


  try {

    validateHostedZoneId(
      target.hostedZoneId,
      "load balancer hosted zone ID"
    );

  }

  catch (error) {

    return {

      valid:
        false,

      error:
        error.message

    };

  }


  return {

    valid:
      true

  };

}


/* =========================================================
   CHECK EXISTING RECORD
========================================================= */

async function findExistingRecord(
  hostedZoneId,
  recordName
) {

  const normalizedZoneId =
    validateHostedZoneId(
      hostedZoneId
    );


  const normalizedRecordName =
    validateHostname(
      recordName
    );


  const response =
    await route53.send(

      new ListResourceRecordSetsCommand({

        HostedZoneId:
          normalizedZoneId,

        StartRecordName:
          `${normalizedRecordName}.`,

        StartRecordType:
          "A",

        MaxItems:
          "10"

      })

    );


  const records =
    response?.ResourceRecordSets ||
    [];


  const exact =
    records.find(
      (record) => {

        const name =
          normalizeDomain(
            record.Name
          );


        return (
          name ===
          normalizedRecordName &&
          record.Type ===
          "A"
        );

      }
    );


  return exact ||
    null;

}


/* =========================================================
   UPSERT ROUTE53 ALIAS
========================================================= */

async function upsertAliasRecord(
  data
) {

  const recordName =
    validateHostname(
      `${data.subdomain}.${data.rootDomain}`
    );


  const hostedZoneId =
    validateHostedZoneId(
      data.hostedZoneId,
      "Route53 hosted zone ID"
    );


  const targetHostedZoneId =
    validateHostedZoneId(
      data.targetHostedZoneId,
      "load balancer hosted zone ID"
    );


  const targetDnsName =
    validateHostname(
      data.targetDnsName
    );


  const response =
    await route53.send(

      new ChangeResourceRecordSetsCommand({

        HostedZoneId:
          hostedZoneId,

        ChangeBatch: {

          Comment:
            `ZyrionOS deployment ${data.deploymentId}`,

          Changes: [

            {

              Action:
                "UPSERT",

              ResourceRecordSet: {

                Name:
                  `${recordName}.`,

                Type:
                  "A",

                AliasTarget: {

                  HostedZoneId:
                    targetHostedZoneId,

                  DNSName:
                    `${targetDnsName}.`,

                  EvaluateTargetHealth:
                    true

                }

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
      "Route53 did not return a change ID"
    );

  }


  return {

    changeId:
      changeInfo.Id,

    status:
      changeInfo.Status ||
      "PENDING",

    recordName,

    recordType:
      "A",

    targetDnsName,

    targetHostedZoneId

  };

}


/* =========================================================
   GET ROUTE53 CHANGE STATUS
========================================================= */

async function getDnsChangeStatus(
  changeId
) {

  if (
    !changeId
  ) {

    return {

      status:
        "UNKNOWN"

    };

  }


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
  options = {}
) {

  const timeoutMs =
    Number(
      options.timeoutMs ||
      60000
    );


  const pollIntervalMs =
    Number(
      options.pollIntervalMs ||
      3000
    );


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
      await getDnsChangeStatus(
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
   VERIFY RECORD AFTER UPSERT
========================================================= */

async function verifyAliasRecord(
  hostedZoneId,
  recordName,
  target
) {

  const record =
    await findExistingRecord(
      hostedZoneId,
      recordName
    );


  if (
    !record
  ) {

    return {

      exists:
        false,

      matches:
        false,

      record:
        null

    };

  }


  if (
    !record.AliasTarget
  ) {

    return {

      exists:
        true,

      matches:
        false,

      record

    };

  }


  const actualTarget =
    normalizeDomain(
      record
        .AliasTarget
        .DNSName
    );


  const expectedTarget =
    normalizeDomain(
      target.dnsName
    );


  const actualHostedZoneId =
    normalizeHostedZoneId(
      record
        .AliasTarget
        .HostedZoneId
    );


  const expectedHostedZoneId =
    normalizeHostedZoneId(
      target.hostedZoneId
    );


  const matches =
    actualTarget ===
      expectedTarget &&
    actualHostedZoneId ===
      expectedHostedZoneId;


  return {

    exists:
      true,

    matches,

    record

  };

}


/* =========================================================
   CUSTOM DOMAIN
========================================================= */

function normalizeCustomDomain(
  value
) {

  if (
    !value
  ) {

    return null;

  }


  return validateHostname(
    value
  );

}


/* =========================================================
   DOMAIN AGENT
========================================================= */

async function domainAgent(
  projectData = {}
) {

  let currentStage =
    "request-validation";


  const startedAt =
    Date.now();


  try {

    logger.info(
      "🌐 ZyrionOS Domain Agent Started"
    );


    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    if (
      !projectData ||
      typeof projectData !==
        "object" ||
      Array.isArray(
        projectData
      )
    ) {

      return {

        success:
          false,

        message:
          "Project domain data required",

        stage:
          currentStage

      };

    }


    const projectName =
      cleanString(
        projectData.projectName,
        MAX_PROJECT_NAME_LENGTH
      ) ||
      "zyrion-app";


    const deploymentId =
      normalizeDeploymentId(
        projectData.deploymentId
      );


    /* =====================================================
       ROOT DOMAIN
    ===================================================== */

    currentStage =
      "root-domain-validation";


    const rootDomain =
      validateRootDomain(

        projectData.rootDomain ||
        process.env.APP_DOMAIN ||
        "zyrionos.com"

      );


    /* =====================================================
       CUSTOM DOMAIN
    ===================================================== */

    currentStage =
      "custom-domain-validation";


    const customDomain =
      normalizeCustomDomain(
        projectData.customDomain
      );


    /*
     * The automatic Route53 record created by this
     * agent belongs to APP_DOMAIN/rootDomain.
     *
     * A custom domain may be returned as metadata,
     * but this agent does not silently modify an
     * unrelated hosted zone.
     */

    if (
      customDomain &&
      !(
        customDomain ===
        rootDomain ||
        customDomain.endsWith(
          `.${rootDomain}`
        )
      )
    ) {

      logger.warning(
        `Custom domain ${customDomain} is outside managed root domain ${rootDomain}; it will not be modified by this agent.`
      );

    }


    /* =====================================================
       CREATE SUBDOMAIN
    ===================================================== */

    currentStage =
      "subdomain-generation";


    const subdomain =
      createSubdomain(
        projectName,
        deploymentId
      );


    const hostname =
      buildHostname(
        subdomain,
        rootDomain
      );


    const httpUrl =
      buildHttpUrl(
        hostname
      );


    const httpsUrl =
      buildHttpsUrl(
        hostname
      );


    /* =====================================================
       LOAD BALANCER TARGET
    ===================================================== */

    currentStage =
      "load-balancer-validation";


    const loadBalancer =
      getLoadBalancerTarget(
        projectData
      );


    const loadBalancerValidation =
      validateLoadBalancerTarget(
        loadBalancer
      );


    /* =====================================================
       HOSTED ZONE
    ===================================================== */

    currentStage =
      "route53-hosted-zone";


    const hostedZone =
      await findHostedZone(
        rootDomain
      );


    logger.success(
      `Route53 Hosted Zone Verified: ${rootDomain}`
    );


    /* =====================================================
       NO LOAD BALANCER
    ===================================================== */

    if (
      !loadBalancerValidation.valid
    ) {

      logger.warning(
        `DNS waiting for load balancer: ${loadBalancerValidation.error}`
      );


      return {

        success:
          true,

        message:
          "Domain prepared but DNS is waiting for a valid load balancer target.",

        domain: {

          deploymentId,

          projectName,

          subdomain,

          hostname,

          rootDomain,

          httpUrl,

          httpsUrl,

          customDomain,

          recordType:
            "A",

          dns: {

            provider:
              "AWS Route53",

            configured:
              false,

            route53ChangeStatus:
              "NOT_STARTED",

            propagationStatus:
              "waiting_for_load_balancer",

            changeId:
              null,

            hostedZoneId:
              hostedZone.id,

            recordName:
              hostname,

            recordVerified:
              false

          },

          loadBalancer: {

            configured:
              false,

            dnsName:
              null,

            hostedZoneId:
              null

          },

          ssl: {

            enabled:
              false,

            provider:
              "AWS ACM",

            status:
              "not_configured",

            httpsEnabled:
              false,

            managedBy:
              "sslAgent"

          },

          domainReady:
            false,

          dnsReady:
            false,

          sslReady:
            false,

          fullyReady:
            false,

          reason:
            loadBalancerValidation.error,

          createdAt:
            new Date().toISOString(),

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       EXISTING RECORD CHECK
    ===================================================== */

    currentStage =
      "route53-existing-record-check";


    const existingRecord =
      await findExistingRecord(
        hostedZone.id,
        hostname
      );


    if (
      existingRecord
    ) {

      logger.info(
        `Existing Route53 A record found for ${hostname}; UPSERT will reconcile it.`
      );

    }


    /* =====================================================
       ROUTE53 DNS UPSERT
    ===================================================== */

    currentStage =
      "route53-dns-upsert";


    const dnsChange =
      await upsertAliasRecord({

        deploymentId,

        subdomain,

        rootDomain,

        hostedZoneId:
          hostedZone.id,

        targetDnsName:
          loadBalancer.dnsName,

        targetHostedZoneId:
          loadBalancer.hostedZoneId

      });


    logger.success(
      `Route53 DNS UPSERT accepted: ${hostname}`
    );


    /* =====================================================
       ROUTE53 CHANGE VERIFICATION
    ===================================================== */

    currentStage =
      "route53-change-verification";


    const changeVerification =
      await waitForRoute53Change(

        dnsChange.changeId,

        {

          timeoutMs:
            Number(
              projectData.dnsVerificationTimeoutMs ||
              process.env.AWS_ROUTE53_CHANGE_TIMEOUT_MS ||
              60000
            ),

          pollIntervalMs:
            Number(
              projectData.dnsVerificationPollIntervalMs ||
              process.env.AWS_ROUTE53_CHANGE_POLL_INTERVAL_MS ||
              3000
            )

        }

      );


    /*
     * Route53 INSYNC means Route53 accepted and
     * synchronized the requested change.
     *
     * It does NOT prove that every recursive DNS
     * resolver on the Internet has refreshed.
     */

    const route53InSync =
      changeVerification.success &&
      changeVerification.status ===
        "INSYNC";


    /* =====================================================
       RECORD VERIFICATION
    ===================================================== */

    currentStage =
      "route53-record-verification";


    const recordVerification =
      await verifyAliasRecord(

        hostedZone.id,

        hostname,

        {

          dnsName:
            loadBalancer.dnsName,

          hostedZoneId:
            loadBalancer.hostedZoneId

        }

      );


    const recordVerified =
      recordVerification.exists &&
      recordVerification.matches;


    /* =====================================================
       DNS STATE
    ===================================================== */

    const dnsReady =
      route53InSync &&
      recordVerified;


    /* =====================================================
       SSL STATE
    ===================================================== */

    /*
     * SSL belongs to sslAgent.
     *
     * Domain Agent never reports HTTPS as active
     * merely because the HTTPS URL can be constructed.
     */

    const sslReady =
      false;


    const fullyReady =
      dnsReady &&
      sslReady;


    /* =====================================================
       DOMAIN DATA
    ===================================================== */

    const domainData = {

      deploymentId,

      projectName,

      subdomain,

      hostname,

      rootDomain,

      httpUrl,

      httpsUrl,

      customDomain,

      recordType:
        "A",

      dns: {

        provider:
          "AWS Route53",

        configured:
          true,

        dnsReady,

        route53ChangeStatus:
          changeVerification.status,

        propagationStatus:
          route53InSync
            ? "route53_insync"
            : "pending",

        changeId:
          dnsChange.changeId,

        changeStatus:
          dnsChange.status,

        hostedZoneId:
          hostedZone.id,

        hostedZoneName:
          hostedZone.name,

        recordName:
          hostname,

        recordVerified,

        recordExists:
          recordVerification.exists,

        recordMatches:
          recordVerification.matches,

        target:
          loadBalancer.dnsName,

        targetHostedZoneId:
          loadBalancer.hostedZoneId

      },

      loadBalancer: {

        configured:
          true,

        dnsName:
          loadBalancer.dnsName,

        hostedZoneId:
          loadBalancer.hostedZoneId

      },

      ssl: {

        enabled:
          false,

        provider:
          "AWS ACM",

        status:
          "pending",

        httpsEnabled:
          false,

        managedBy:
          "sslAgent"

      },

      domainReady:
        dnsReady,

      dnsReady,

      sslReady,

      fullyReady,

      createdAt:
        new Date().toISOString(),

      durationMs:
        Date.now() -
        startedAt

    };


    /* =====================================================
       FINAL LOG
    ===================================================== */

    if (
      dnsReady
    ) {

      logger.success(
        `🌐 Domain DNS Ready: ${hostname}`
      );

    }

    else {

      logger.warning(
        `🌐 Domain DNS Pending: ${hostname}`
      );

    }


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

      message:
        dnsReady
          ? "Domain DNS configured and verified by Route53."
          : "Domain request accepted but DNS is not fully verified yet.",

      domain:
        domainData

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown Domain Agent error";


    logger.error(
      `Domain Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success:
        false,

      message:
        "Domain configuration failed",

      error:
        errorMessage,

      stage:
        currentStage,

      deploymentId:
        projectData?.deploymentId ||
        null,

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
  domainAgent;
