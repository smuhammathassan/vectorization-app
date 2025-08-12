#!/usr/bin/env node

const http = require('http');
const { performance } = require('perf_hooks');

// Performance test configuration
const config = {
  baseUrl: 'http://localhost:3002',
  concurrentRequests: 10,
  totalRequests: 100,
  endpoints: [
    '/api/v1/health',
    '/api/v1/methods',
    '/api'
  ]
};

// Test statistics
let stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  errors: [],
  startTime: 0,
  endTime: 0
};

// Make a single HTTP request
function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const url = `${config.baseUrl}${endpoint}`;
    
    const req = http.get(url, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        resolve({
          statusCode: res.statusCode,
          responseTime: responseTime,
          headers: res.headers,
          bodySize: data.length,
          endpoint: endpoint
        });
      });
    });
    
    req.on('error', (error) => {
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      
      reject({
        error: error.message,
        responseTime: responseTime,
        endpoint: endpoint
      });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject({
        error: 'Request timeout',
        responseTime: 10000,
        endpoint: endpoint
      });
    });
  });
}

// Run concurrent requests
async function runConcurrentTest(endpoint, concurrency, totalRequests) {
  const results = [];
  const batches = Math.ceil(totalRequests / concurrency);
  
  console.log(`Testing ${endpoint} with ${concurrency} concurrent requests, ${totalRequests} total requests`);
  
  for (let batch = 0; batch < batches; batch++) {
    const requestsInBatch = Math.min(concurrency, totalRequests - (batch * concurrency));
    const promises = [];
    
    for (let i = 0; i < requestsInBatch; i++) {
      promises.push(makeRequest(endpoint));
    }
    
    try {
      const batchResults = await Promise.allSettled(promises);
      results.push(...batchResults);
      
      // Add small delay between batches
      if (batch < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Batch error:', error);
    }
  }
  
  return results;
}

// Analyze results
function analyzeResults(results, endpoint) {
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.statusCode === 200);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.statusCode !== 200));
  
  const responseTimes = successful.map(r => r.value.responseTime);
  const avgResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
  
  // Calculate percentiles
  const sortedTimes = responseTimes.sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
  
  // Check for performance headers
  const sampleHeaders = successful.length > 0 ? successful[0].value.headers : {};
  const hasPerformanceHeaders = {
    'x-response-time': !!sampleHeaders['x-response-time'],
    'x-server-timing': !!sampleHeaders['x-server-timing'],
    'x-cache': !!sampleHeaders['x-cache'],
    'content-encoding': !!sampleHeaders['content-encoding']
  };
  
  return {
    endpoint,
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    successRate: ((successful.length / results.length) * 100).toFixed(2) + '%',
    responseTime: {
      average: avgResponseTime.toFixed(2) + 'ms',
      p50: p50.toFixed(2) + 'ms',
      p95: p95.toFixed(2) + 'ms',
      p99: p99.toFixed(2) + 'ms',
      min: Math.min(...responseTimes).toFixed(2) + 'ms',
      max: Math.max(...responseTimes).toFixed(2) + 'ms'
    },
    performanceHeaders: hasPerformanceHeaders,
    errors: failed.map(f => ({
      error: f.reason?.error || f.value?.statusCode || 'Unknown error',
      endpoint: f.reason?.endpoint || f.value?.endpoint
    }))
  };
}

// Main test function
async function runPerformanceTest() {
  console.log('🚀 Starting Performance Test Suite');
  console.log('=====================================');
  console.log(`Configuration:`);
  console.log(`- Base URL: ${config.baseUrl}`);
  console.log(`- Concurrent Requests: ${config.concurrentRequests}`);
  console.log(`- Total Requests per Endpoint: ${config.totalRequests}`);
  console.log(`- Endpoints: ${config.endpoints.join(', ')}`);
  console.log('');
  
  const overallStartTime = performance.now();
  const testResults = [];
  
  for (const endpoint of config.endpoints) {
    console.log(`Testing endpoint: ${endpoint}`);
    
    try {
      const results = await runConcurrentTest(endpoint, config.concurrentRequests, config.totalRequests);
      const analysis = analyzeResults(results, endpoint);
      testResults.push(analysis);
      
      console.log(`✅ ${endpoint} completed`);
      console.log(`   Success Rate: ${analysis.successRate}`);
      console.log(`   Average Response Time: ${analysis.responseTime.average}`);
      console.log(`   P95 Response Time: ${analysis.responseTime.p95}`);
      console.log('');
    } catch (error) {
      console.error(`❌ ${endpoint} failed:`, error.message);
      console.log('');
    }
  }
  
  const overallEndTime = performance.now();
  const totalDuration = (overallEndTime - overallStartTime).toFixed(2);
  
  // Print summary
  console.log('📊 PERFORMANCE TEST RESULTS');
  console.log('============================');
  console.log(`Total Test Duration: ${totalDuration}ms`);
  console.log('');
  
  testResults.forEach(result => {
    console.log(`📍 ${result.endpoint}`);
    console.log(`   Total Requests: ${result.totalRequests}`);
    console.log(`   Success Rate: ${result.successRate}`);
    console.log(`   Response Times:`);
    console.log(`     Average: ${result.responseTime.average}`);
    console.log(`     P50: ${result.responseTime.p50}`);
    console.log(`     P95: ${result.responseTime.p95}`);
    console.log(`     P99: ${result.responseTime.p99}`);
    console.log(`     Min: ${result.responseTime.min}`);
    console.log(`     Max: ${result.responseTime.max}`);
    console.log(`   Performance Headers:`);
    console.log(`     X-Response-Time: ${result.performanceHeaders['x-response-time'] ? '✅' : '❌'}`);
    console.log(`     X-Server-Timing: ${result.performanceHeaders['x-server-timing'] ? '✅' : '❌'}`);
    console.log(`     X-Cache: ${result.performanceHeaders['x-cache'] ? '✅' : '❌'}`);
    console.log(`     Content-Encoding: ${result.performanceHeaders['content-encoding'] ? '✅' : '❌'}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors (${result.errors.length}):`);
      result.errors.slice(0, 3).forEach(error => {
        console.log(`     - ${error.error}`);
      });
      if (result.errors.length > 3) {
        console.log(`     ... and ${result.errors.length - 3} more`);
      }
    }
    console.log('');
  });
  
  // Performance recommendations
  console.log('💡 PERFORMANCE RECOMMENDATIONS');
  console.log('===============================');
  
  const overallAvgTime = testResults.reduce((sum, result) => {
    return sum + parseFloat(result.responseTime.average);
  }, 0) / testResults.length;
  
  const overallP95Time = testResults.reduce((sum, result) => {
    return sum + parseFloat(result.responseTime.p95);
  }, 0) / testResults.length;
  
  console.log(`Overall Average Response Time: ${overallAvgTime.toFixed(2)}ms`);
  console.log(`Overall P95 Response Time: ${overallP95Time.toFixed(2)}ms`);
  
  if (overallAvgTime > 500) {
    console.log('⚠️  High average response time detected');
    console.log('   Consider: Adding more aggressive caching, optimizing database queries');
  } else if (overallAvgTime > 200) {
    console.log('ℹ️  Moderate response times');
    console.log('   Consider: Performance profiling to identify bottlenecks');
  } else {
    console.log('✅ Excellent response times');
  }
  
  if (overallP95Time > 1000) {
    console.log('⚠️  High P95 response time indicates performance inconsistency');
    console.log('   Consider: Load balancing, connection pooling improvements');
  }
  
  const hasCompressionIssues = testResults.some(r => !r.performanceHeaders['content-encoding']);
  if (hasCompressionIssues) {
    console.log('ℹ️  Some endpoints missing compression');
    console.log('   Consider: Enabling gzip/brotli compression for better performance');
  }
  
  const hasCacheIssues = testResults.some(r => !r.performanceHeaders['x-cache']);
  if (hasCacheIssues) {
    console.log('ℹ️  Some endpoints missing cache headers');
    console.log('   Consider: Implementing caching headers for better client-side caching');
  }
  
  console.log('\n🎉 Performance test completed!');
}

// Run the test
if (require.main === module) {
  runPerformanceTest().catch(error => {
    console.error('Performance test failed:', error);
    process.exit(1);
  });
}

module.exports = { runPerformanceTest, makeRequest, analyzeResults };