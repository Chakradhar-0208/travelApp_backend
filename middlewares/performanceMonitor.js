// import client from "prom-client";

// // 🔹 Create a Registry to register the metrics
// const register = new client.Registry();

// // 🔹 Default metrics (CPU, memory, event loop lag, etc.)
// client.collectDefaultMetrics({ register });

// // 🔹 Create custom metrics
// const httpRequestDuration = new client.Histogram({
//   name: "http_request_duration_ms",
//   help: "Duration of HTTP requests in ms",
//   labelNames: ["method", "route", "status_code"],
//   buckets: [50, 100, 300, 500, 1000, 3000, 5000], // histogram buckets
// });

// const httpRequestsTotal = new client.Counter({
//   name: "http_requests_total",
//   help: "Total number of HTTP requests",
//   labelNames: ["method", "route", "status_code"],
// });

// const httpErrorsTotal = new client.Counter({
//   name: "http_errors_total",
//   help: "Total number of error responses",
//   labelNames: ["method", "route", "status_code"],
// });

// // Register metrics
// register.registerMetric(httpRequestDuration);
// register.registerMetric(httpRequestsTotal);
// register.registerMetric(httpErrorsTotal);

// // 🔹 Middleware
// export function performanceMonitor(req, res, next) {
//   const startEpoch = Date.now();

//   res.on("finish", () => {
//     const duration = Date.now() - startEpoch;
//     const route = req.route?.path || req.path;

//     httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
//     httpRequestsTotal.labels(req.method, route, res.statusCode).inc();

//     if (res.statusCode >= 400) {
//       httpErrorsTotal.labels(req.method, route, res.statusCode).inc();
//     }
//   });
//     const start = process.hrtime.bigint(); // high-precision timer

//   res.on("finish", () => {
//     const end = process.hrtime.bigint();
//     const durationMs = Number(end - start) / 1e6;

//     console.log(
//       `Response Time: [${req.method}] ${req.originalUrl} - ${res.statusCode} - ${durationMs.toFixed(2)}ms`
//     );
//   });
//   next();
// }

// // 🔹 Expose metrics endpoint
// export async function metricsHandler(req, res) {
//   res.set("Content-Type", register.contentType);
//   res.end(await register.metrics());
// }
import client from "prom-client";
import os from "os";

const register = new client.Registry();

// -------------------------------------------------------
// 🧠 Custom lightweight system metrics (CPU + Memory)
// -------------------------------------------------------
const cpuUsageGauge = new client.Gauge({
  name: "app_cpu_usage_percent",
  help: "CPU usage percentage of the Node.js process",
});

const memoryUsageGauge = new client.Gauge({
  name: "app_memory_usage_percent",
  help: "Memory usage percentage of the Node.js process",
});

register.registerMetric(cpuUsageGauge);
register.registerMetric(memoryUsageGauge);

// Function to update system metrics every 5 seconds
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const usedMemoryPercent = (memoryUsage.rss / totalMemory) * 100;

  const cpuUsage = process.cpuUsage();
  const totalCpuTime = cpuUsage.user + cpuUsage.system; // microseconds
  const totalCpuPercent = (totalCpuTime / (5 * 1e6 * os.cpus().length)) * 100; // 5s window

  memoryUsageGauge.set(usedMemoryPercent);
  cpuUsageGauge.set(totalCpuPercent);
}, 5000);


const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  buckets: [50, 100, 300, 500, 1000, 3000],
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

const httpErrorsTotal = new client.Counter({
  name: "http_errors_total",
  help: "Total number of error responses",
  labelNames: ["method", "route", "status_code"],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpErrorsTotal);


export function performanceMonitor(req, res, next) {
  const startEpoch = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startEpoch;
    const route = req.route?.path || req.path;

    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
    httpRequestsTotal.labels(req.method, route, res.statusCode).inc();

    if (res.statusCode >= 400) {
      httpErrorsTotal.labels(req.method, route, res.statusCode).inc();
    }
  });
  const start = process.hrtime.bigint(); // high-precision timer

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    console.log(
      `[Respnse Time]: [${req.method}] ${req.originalUrl} - ${res.statusCode} - ${durationMs.toFixed(2)}ms`
    );
  });

  next();
}


export async function metricsHandler(req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
