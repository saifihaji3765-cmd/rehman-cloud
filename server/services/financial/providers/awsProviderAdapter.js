"use strict";

const {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
} = require("@aws-sdk/client-cost-explorer");

const {
  ECSClient,
  DescribeServicesCommand,
  DescribeClustersCommand,
} = require("@aws-sdk/client-ecs");

const REGION =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

const costExplorer = new CostExplorerClient({
  region: REGION,
});

const ecs = new ECSClient({
  region: REGION,
});

function clean(value, max = 500) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function isConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_ROLE_ARN ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE
  );
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDateOnly(value) {
  const date = normalizeDate(value);

  if (!date) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeAwsError(error) {
  if (!error) {
    return {
      code: "AWS_UNKNOWN_ERROR",
      message: "AWS request failed",
      status: "error",
    };
  }

  const code =
    error.name ||
    error.Code ||
    error.code ||
    "AWS_REQUEST_FAILED";

  let status = "error";

  if (
    code === "CredentialsProviderError" ||
    code === "UnrecognizedClientException" ||
    code === "InvalidClientTokenId"
  ) {
    status = "not_configured";
  }

  if (
    code === "AccessDeniedException" ||
    code === "UnauthorizedOperation"
  ) {
    status = "unavailable";
  }

  if (
    code === "TimeoutError" ||
    code === "RequestTimeout" ||
    code === "NetworkingError"
  ) {
    status = "unavailable";
  }

  return {
    code: clean(code, 150),
    message: clean(
      error.message || "AWS request failed",
      500
    ),
    status,
  };
}

function resolveClusterName(input = {}) {
  return clean(
    input.clusterName ||
      input.cluster ||
      process.env.AWS_ECS_CLUSTER ||
      process.env.AWS_ECS_CLUSTER_NAME
  );
}

function resolveServiceName(input = {}) {
  return clean(
    input.serviceName ||
      input.service ||
      input.appData?.serviceName ||
      input.appData?.aws?.ecs?.service
  );
}

function resolveProjectId(input = {}) {
  return clean(
    input.projectId ||
      input.appData?.projectId
  );
}

function resolveAccountId(input = {}) {
  return clean(
    input.accountId ||
      process.env.AWS_ACCOUNT_ID
  );
}

function resolveDateRange({
  start,
  end,
} = {}) {
  const endDate =
    normalizeDate(end) || new Date();

  const startDate =
    normalizeDate(start) ||
    new Date(
      endDate.getTime() -
        24 * 60 * 60 * 1000
    );

  return {
    start: formatDateOnly(startDate),
    end: formatDateOnly(endDate),
  };
}

async function health() {
  if (!isConfigured()) {
    return {
      provider: "aws",
      status: "not_configured",
      available: false,
      source: "aws_sdk",
      retrievedAt: new Date(),
    };
  }

  try {
    const clusterName = resolveClusterName();

    if (clusterName) {
      await ecs.send(
        new DescribeClustersCommand({
          clusters: [clusterName],
        })
      );
    } else {
      /*
       * Cost Explorer is used as a lightweight AWS
       * account-level connectivity test when an ECS
       * cluster has not been configured.
       */
      const range = resolveDateRange({});

      await costExplorer.send(
        new GetCostAndUsageCommand({
          TimePeriod: {
            Start: range.start,
            End: range.end,
          },
          Granularity: "DAILY",
          Metrics: ["UnblendedCost"],
        })
      );
    }

    return {
      provider: "aws",
      status: "available",
      available: true,
      source: "aws_sdk",
      retrievedAt: new Date(),
      region: REGION,
    };
  } catch (error) {
    const normalized = normalizeAwsError(error);

    return {
      provider: "aws",
      status: normalized.status,
      available: false,
      source: "aws_sdk",
      retrievedAt: new Date(),
      region: REGION,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

function buildCostObservations(response, {
  start,
  end,
  accountId,
  projectId,
} = {}) {
  const observations = [];

  const results =
    Array.isArray(response?.ResultsByTime)
      ? response.ResultsByTime
      : [];

  for (const period of results) {
    const periodStart = normalizeDate(
      period?.TimePeriod?.Start
    );

    const periodEnd = normalizeDate(
      period?.TimePeriod?.End
    );

    const groups = Array.isArray(
      period?.Groups
    )
      ? period.Groups
      : [];

    /*
     * If no grouping was requested AWS returns
     * Total. This is still authoritative provider
     * cost data.
     */
    if (!groups.length) {
      const amount = Number(
        period?.Total?.UnblendedCost?.Amount
      );

      const unit = clean(
        period?.Total?.UnblendedCost?.Unit
      );

      if (
        Number.isFinite(amount) &&
        unit
      ) {
        observations.push({
          provider: "aws",
          source: "aws_cost_explorer",
          status: "available",
          confidence: "provider_reported",
          value: amount,
          currency: unit,
          observedAt:
            periodEnd || new Date(),
          retrievedAt: new Date(),
          period: {
            start: periodStart,
            end: periodEnd,
          },
          accountId:
            accountId || null,
          projectId:
            projectId || null,
        });
      }

      continue;
    }

    for (const group of groups) {
      const amount = Number(
        group?.Metrics?.UnblendedCost?.Amount
      );

      const unit = clean(
        group?.Metrics?.UnblendedCost?.Unit
      );

      if (
        !Number.isFinite(amount) ||
        !unit
      ) {
        continue;
      }

      const keys = Array.isArray(group.Keys)
        ? group.Keys.map((item) =>
            clean(item, 200)
          )
        : [];

      observations.push({
        provider: "aws",
        source: "aws_cost_explorer",
        status: "available",
        confidence: "provider_reported",
        value: amount,
        currency: unit,
        observedAt:
          periodEnd || new Date(),
        retrievedAt: new Date(),
        period: {
          start: periodStart,
          end: periodEnd,
        },
        accountId:
          accountId || null,
        projectId:
          projectId || null,
        dimensions: keys,
      });
    }
  }

  return observations;
}

async function getCosts({
  start,
  end,
  granularity = "DAILY",
  accountId,
  projectId,
  service,
  region,
} = {}) {
  if (!isConfigured()) {
    return {
      provider: "aws",
      status: "not_configured",
      available: false,
      observations: [],
      source: "aws_cost_explorer",
      retrievedAt: new Date(),
    };
  }

  const range = resolveDateRange({
    start,
    end,
  });

  const filters = [];

  if (service) {
    filters.push({
      Dimensions: {
        Key: "SERVICE",
        Values: [
          clean(service, 200),
        ],
      },
    });
  }

  if (region) {
    filters.push({
      Dimensions: {
        Key: "REGION",
        Values: [
          clean(region, 200),
        ],
      },
    });
  }

  const request = {
    TimePeriod: {
      Start: range.start,
      End: range.end,
    },
    Granularity:
      granularity === "MONTHLY"
        ? "MONTHLY"
        : "DAILY",
    Metrics: ["UnblendedCost"],
  };

  if (filters.length === 1) {
    request.Filter = filters[0];
  } else if (filters.length > 1) {
    request.Filter = {
      And: filters,
    };
  }

  try {
    const response =
      await costExplorer.send(
        new GetCostAndUsageCommand(
          request
        )
      );

    const observations =
      buildCostObservations(
        response,
        {
          start: range.start,
          end: range.end,
          accountId:
            accountId ||
            resolveAccountId(),
          projectId:
            projectId ||
            null,
        }
      );

    return {
      provider: "aws",
      status: "available",
      available: true,
      source: "aws_cost_explorer",
      retrievedAt: new Date(),
      region: REGION,
      observations,
      period: {
        start: range.start,
        end: range.end,
      },
    };
  } catch (error) {
    const normalized = normalizeAwsError(error);

    return {
      provider: "aws",
      status: normalized.status,
      available: false,
      observations: [],
      source: "aws_cost_explorer",
      retrievedAt: new Date(),
      region: REGION,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getForecast({
  start,
  end,
  metric = "UNBLENDED_COST",
  granularity = "MONTHLY",
} = {}) {
  if (!isConfigured()) {
    return {
      provider: "aws",
      status: "not_configured",
      available: false,
      observations: [],
      source: "aws_cost_forecast",
      retrievedAt: new Date(),
    };
  }

  const range = resolveDateRange({
    start,
    end,
  });

  try {
    const response =
      await costExplorer.send(
        new GetCostForecastCommand({
          TimePeriod: {
            Start: range.start,
            End: range.end,
          },
          Metric: metric,
          Granularity:
            granularity === "DAILY"
              ? "DAILY"
              : "MONTHLY",
        })
      );

    const total =
      Number(response?.Total?.Amount);

    const unit = clean(
      response?.Total?.Unit
    );

    return {
      provider: "aws",
      status:
        Number.isFinite(total) && unit
          ? "available"
          : "unavailable",
      available:
        Number.isFinite(total) && Boolean(unit),
      source: "aws_cost_forecast",
      retrievedAt: new Date(),
      region: REGION,
      forecast:
        Number.isFinite(total) && unit
          ? {
              value: total,
              currency: unit,
              period: {
                start: range.start,
                end: range.end,
              },
            }
          : null,
      rawMeta: {
        predictionInterval:
          response?.PredictionIntervalLevel ??
          null,
      },
    };
  } catch (error) {
    const normalized = normalizeAwsError(error);

    return {
      provider: "aws",
      status: normalized.status,
      available: false,
      forecast: null,
      source: "aws_cost_forecast",
      retrievedAt: new Date(),
      region: REGION,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getInfrastructure({
  clusterName,
  serviceName,
} = {}) {
  if (!isConfigured()) {
    return {
      provider: "aws",
      status: "not_configured",
      available: false,
      source: "aws_ecs",
      retrievedAt: new Date(),
      infrastructure: null,
    };
  }

  const cluster =
    resolveClusterName({
      clusterName,
    });

  if (!cluster) {
    return {
      provider: "aws",
      status: "not_configured",
      available: false,
      source: "aws_ecs",
      retrievedAt: new Date(),
      infrastructure: null,
      reason: "AWS_ECS_CLUSTER_NOT_CONFIGURED",
    };
  }

  try {
    const clusterResponse =
      await ecs.send(
        new DescribeClustersCommand({
          clusters: [cluster],
          include: [
            "ATTACHMENTS",
            "CONFIGURATIONS",
            "SETTINGS",
            "TAGS",
          ],
        })
      );

    const clusterData =
      clusterResponse?.clusters?.[0];

    if (!clusterData) {
      return {
        provider: "aws",
        status: "unavailable",
        available: false,
        source: "aws_ecs",
        retrievedAt: new Date(),
        infrastructure: null,
        reason: "ECS_CLUSTER_NOT_FOUND",
      };
    }

    let serviceData = null;

    const service =
      resolveServiceName({
        serviceName,
      });

    if (service) {
      const serviceResponse =
        await ecs.send(
          new DescribeServicesCommand({
            cluster,
            services: [service],
          })
        );

      serviceData =
        serviceResponse?.services?.[0] ||
        null;
    }

    return {
      provider: "aws",
      status: "available",
      available: true,
      source: "aws_ecs",
      retrievedAt: new Date(),
      region: REGION,
      infrastructure: {
        cluster: {
          name:
            clusterData.clusterName ||
            cluster,
          arn:
            clusterData.clusterArn ||
            null,
          status:
            clusterData.status ||
            null,
          runningTasks:
            typeof clusterData.runningTasksCount ===
            "number"
              ? clusterData.runningTasksCount
              : null,
          pendingTasks:
            typeof clusterData.pendingTasksCount ===
            "number"
              ? clusterData.pendingTasksCount
              : null,
          activeServices:
            typeof clusterData.activeServicesCount ===
            "number"
              ? clusterData.activeServicesCount
              : null,
          registeredInstances:
            typeof clusterData.registeredContainerInstancesCount ===
            "number"
              ? clusterData.registeredContainerInstancesCount
              : null,
        },

        service: serviceData
          ? {
              name:
                serviceData.serviceName ||
                service,
              arn:
                serviceData.serviceArn ||
                null,
              status:
                serviceData.status ||
                null,
              desiredCount:
                typeof serviceData.desiredCount ===
                "number"
                  ? serviceData.desiredCount
                  : null,
              runningCount:
                typeof serviceData.runningCount ===
                "number"
                  ? serviceData.runningCount
                  : null,
              pendingCount:
                typeof serviceData.pendingCount ===
                "number"
                  ? serviceData.pendingCount
                  : null,
              taskDefinition:
                serviceData.taskDefinition ||
                null,
              launchType:
                serviceData.launchType ||
                null,
            }
          : null,
      },
    };
  } catch (error) {
    const normalized = normalizeAwsError(error);

    return {
      provider: "aws",
      status: normalized.status,
      available: false,
      source: "aws_ecs",
      retrievedAt: new Date(),
      region: REGION,
      infrastructure: null,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getUsage(options = {}) {
  const infrastructure =
    await getInfrastructure(options);

  if (!infrastructure.available) {
    return {
      provider: "aws",
      status: infrastructure.status,
      available: false,
      source: "aws_ecs",
      retrievedAt: new Date(),
      observations: [],
      infrastructure:
        infrastructure.infrastructure ||
        null,
      error:
        infrastructure.error ||
        null,
    };
  }

  const service =
    infrastructure.infrastructure?.service;

  const cluster =
    infrastructure.infrastructure?.cluster;

  const observations = [];

  if (service) {
    if (
      typeof service.desiredCount ===
      "number"
    ) {
      observations.push({
        provider: "aws",
        source: "aws_ecs",
        status: "available",
        confidence: "provider_reported",
        value: service.desiredCount,
        unit: "tasks_desired",
        observedAt: new Date(),
        retrievedAt: new Date(),
        projectId:
          resolveProjectId(options) ||
          null,
        accountId:
          resolveAccountId(options) ||
          null,
        service:
          service.name,
      });
    }

    if (
      typeof service.runningCount ===
      "number"
    ) {
      observations.push({
        provider: "aws",
        source: "aws_ecs",
        status: "available",
        confidence: "provider_reported",
        value: service.runningCount,
        unit: "tasks_running",
        observedAt: new Date(),
        retrievedAt: new Date(),
        projectId:
          resolveProjectId(options) ||
          null,
        accountId:
          resolveAccountId(options) ||
          null,
        service:
          service.name,
      });
    }

    if (
      typeof service.pendingCount ===
      "number"
    ) {
      observations.push({
        provider: "aws",
        source: "aws_ecs",
        status: "available",
        confidence: "provider_reported",
        value: service.pendingCount,
        unit: "tasks_pending",
        observedAt: new Date(),
        retrievedAt: new Date(),
        projectId:
          resolveProjectId(options) ||
          null,
        accountId:
          resolveAccountId(options) ||
          null,
        service:
          service.name,
      });
    }
  }

  if (cluster) {
    if (
      typeof cluster.runningTasks ===
      "number"
    ) {
      observations.push({
        provider: "aws",
        source: "aws_ecs",
        status: "available",
        confidence: "provider_reported",
        value: cluster.runningTasks,
        unit: "cluster_tasks_running",
        observedAt: new Date(),
        retrievedAt: new Date(),
        accountId:
          resolveAccountId(options) ||
          null,
        cluster:
          cluster.name,
      });
    }
  }

  return {
    provider: "aws",
    status: "available",
    available: true,
    source: "aws_ecs",
    retrievedAt: new Date(),
    observations,
    infrastructure:
      infrastructure.infrastructure,
  };
}

async function getProviderData(options = {}) {
  const [
    healthResult,
    costResult,
    usageResult,
    forecastResult,
  ] = await Promise.all([
    health(),
    getCosts(options),
    getUsage(options),
    getForecast(options),
  ]);

  return {
    provider: "aws",
    region: REGION,
    retrievedAt: new Date(),
    health: healthResult,
    costs: costResult,
    usage: usageResult,
    forecast: forecastResult,
  };
}

module.exports = {
  provider: "aws",

  region: REGION,

  isConfigured,

  health,

  getCosts,

  getForecast,

  getUsage,

  getInfrastructure,

  getProviderData,
};
