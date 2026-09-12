/* =========================================================
   ZyrionOS DOMAIN AGENT
   Real AWS Route53 Domain Management

   FLOW:

   AWS Agent
        ↓
   ALB / Load Balancer
        ↓
   Domain Agent
        ↓
   Route53 Hosted Zone
        ↓
   DNS Record UPSERT
        ↓
   DNS Verification / Propagation
        ↓
   SSL Agent

   IMPORTANT:

   This agent NEVER claims DNS is configured
   unless Route53 actually accepted the change.

   This agent NEVER claims SSL is active.
   SSL/ACM is handled separately.
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
  GetChangeCommand
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

    "status"

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
      /^https?:\/\//,
      ""
    );


  /*
   * Remove path/query.
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


  const labels =
    normalized.split(".");


  if (
    labels.length <
    2
  ) {

    throw new Error(
      "Invalid root domain"
    );

  }


  for (
    const label of labels
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
      !/^[a-z0-9-]+$/.test(
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
      100
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

  return deploymentId
    .replace(
      /[^a-zA-Z0-9-]/g,
      "-"
    )
    .toLowerCase()
    .slice(
      0,
      16
    );

}


/* =========================================================
   CREATE SUBDOMAIN
========================================================= */

function createSubdomain(
  projectName,
  deploymentId
) {

  const cleanName =
    cleanProjectName(
      projectName
    );


  const shortId =
    shortDeploymentId(
      deploymentId
    );


  let baseName =
    cleanName;


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
    maxBaseLength < 1
  ) {

    throw new Error(
      "Deployment ID is too long for DNS label"
    );

  }


  baseName =
    baseName.slice(
      0,
      maxBaseLength
    )
      .replace(
        /-+$/,
        ""
      );


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


  return subdomain;

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
          "20"

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
   * Private hosted zones are not suitable
   * for public application domains.
   */

  if (
    exactZone.Config?.PrivateZone
  ) {

    throw new Error(
      `Route53 zone ${normalizedRoot} is a private hosted zone`
    );

  }


  const hostedZoneId =
    exactZone.Id
      ?.replace(
        /^\/hostedzone\//,
        ""
      );


  if (
    !hostedZoneId
  ) {

    throw new Error(
      "Route53 hosted zone ID not available"
    );

  }


  return {

    id:
      hostedZoneId,

    name:
      exactZone.Name,

    privateZone:
      false

  };

}


/* =========================================================
   NORMALIZE TARGET
========================================================= */

function getLoadBalancerTarget(
  projectData
) {

  /*
   * Supported input styles:
   *
   * loadBalancerDnsName
   * loadBalancerHostedZoneId
   *
   * OR:
   *
   * loadBalancer: {
   *   dnsName,
   *   hostedZoneId
   * }
   */

  const loadBalancer =
    projectData.loadBalancer ||
    projectData.alb ||
    projectData.aws?.loadBalancer ||
    {};


  const dnsName =
    projectData.loadBalancerDnsName ||
    loadBalancer.dnsName ||
    loadBalancer.DNSName ||
    projectData.aws?.loadBalancerDnsName ||
    "";


  const hostedZoneId =
    projectData.loadBalancerHostedZoneId ||
    loadBalancer.hostedZoneId ||
    loadBalancer.canonicalHostedZoneId ||
    loadBalancer.CanonicalHostedZoneId ||
    projectData.aws?.loadBalancerHostedZoneId ||
    "";


  return {

    dnsName:
      normalizeDomain(
        dnsName
      ),

    hostedZoneId:
      cleanString(
        hostedZoneId,
        300
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


  return {

    valid:
      true

  };

}


/* =========================================================
   UPSERT ROUTE53 ALIAS
========================================================= */

async function upsertAliasRecord(
  data
) {

  const recordName =
    `${data.subdomain}.${data.rootDomain}.`;


  const response =
    await route53.send(

      new ChangeResourceRecordSetsCommand({

        HostedZoneId:
          data.hostedZoneId,

        ChangeBatch: {

          Comment:
            `ZyrionOS deployment ${data.deploymentId}`,

          Changes: [

            {

              Action:
                "UPSERT",

              ResourceRecordSet: {

                Name:
                  recordName,

                Type:
                  "A",

                AliasTarget: {

                  HostedZoneId:
                    data.targetHostedZoneId,

                  DNSName:
                    `${data.targetDnsName}.`,

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
      "PENDING"

  };

}


/* =========================================================
   WAIT FOR ROUTE53 CHANGE
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
   BUILD HTTPS DOMAIN
========================================================= */

function buildHttpsUrl(
  subdomain,
  rootDomain
) {

  return (
    `https://${subdomain}.${rootDomain}`
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
        "object"
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
       CREATE SUBDOMAIN
    ===================================================== */

    currentStage =
      "subdomain-generation";


    const subdomain =
      createSubdomain(
        projectName,
        deploymentId
      );


    const fullHostname =
      `${subdomain}.${rootDomain}`;


    const fullDomain =
      buildHttpsUrl(
        subdomain,
        rootDomain
      );


    /* =====================================================
       CUSTOM DOMAIN
    ===================================================== */

    let customDomain =
      null;


    if (
      projectData.customDomain
    ) {

      customDomain =
        validateRootDomain(
          projectData.customDomain
        );

    }


    /* =====================================================
       LOAD BALANCER
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
       NO TARGET = DNS CANNOT BE CONFIGURED
    ===================================================== */

    if (
      !loadBalancerValidation.valid
    ) {

      logger.warning(
        "Load balancer target unavailable. DNS record was not created."
      );


      return {

        success:
          true,

        message:
          "Domain prepared but DNS is waiting for a load balancer target.",

        domain: {

          deploymentId,

          projectName,

          subdomain,

          hostname:
            fullHostname,

          rootDomain,

          fullDomain,

          customDomain,

          recordType:
            "A",

          dns: {

            provider:
              "AWS Route53",

            configured:
              false,

            propagationStatus:
              "pending",

            changeId:
              null,

            hostedZoneId:
              hostedZone.id,

            recordName:
              fullHostname

          },

          ssl: {

            enabled:
              false,

            provider:
              "AWS ACM",

            status:
              "not_configured",

            httpsEnabled:
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

          domainReady:
            false,

          reason:
            "A real Route53 record requires an ALB/load-balancer target."

        }

      };

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
      `Route53 DNS UPSERT accepted: ${fullHostname}`
    );


    /* =====================================================
       CHECK CHANGE STATUS
    ===================================================== */

    currentStage =
      "route53-change-verification";


    const changeStatus =
      await getDnsChangeStatus(
        dnsChange.changeId
      );


    const dnsConfigured =
      (
        changeStatus.status ===
        "INSYNC"
      );


    /* =====================================================
       SSL IS SEPARATE
    ===================================================== */

    /*
     * Route53 DNS configuration does NOT
     * mean SSL is configured.
     *
     * ACM certificate provisioning belongs
     * to sslAgent.
     */


    const domainData = {

      deploymentId,

      projectName,

      subdomain,

      hostname:
        fullHostname,

      rootDomain,

      fullDomain,

      customDomain,

      recordType:
        "A",

      dns: {

        provider:
          "AWS Route53",

        configured:
          true,

        propagationStatus:
          changeStatus.status ===
          "INSYNC"
            ? "insync"
            : "pending",

        changeId:
          dnsChange.changeId,

        changeStatus:
          changeStatus.status,

        hostedZoneId:
          hostedZone.id,

        recordName:
          fullHostname,

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
        dnsConfigured,

      createdAt:
        new Date().toISOString()

    };


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `🌐 Domain Agent Completed: ${fullHostname}`
    );


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

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
        currentStage

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  domainAgent;
