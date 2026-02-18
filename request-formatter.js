/**
 * Request Formatter - HTTP请求格式化工具
 * 实现HTTP请求格式化工具
 */

// ========== Format Types ==========

const FormatType = {
  CURL: 'curl',
  FETCH: 'fetch',
  AXIOS: 'axios',
  HTTP: 'http',
  PYTHON_REQUESTS: 'python_requests',
  NODE_NATIVE: 'node_native',
  WGET: 'wget'
};

const BodyFormat = {
  JSON: 'json',
  FORM: 'form',
  MULTIPART: 'multipart',
  TEXT: 'text',
  XML: 'xml',
  BINARY: 'binary'
};

// ========== HTTP Request ==========

class HttpRequest {
  constructor(config) {
    this.method = (config.method || 'GET').toUpperCase();
    this.url = config.url;
    this.headers = config.headers || {};
    this.queryParams = config.queryParams || {};
    this.body = config.body || null;
    this.bodyFormat = config.bodyFormat || BodyFormat.JSON;
    this.auth = config.auth || null;
    this.timeout = config.timeout || 30000;
    this.followRedirects = config.followRedirects !== false;
    this.validateSSL = config.validateSSL !== false;
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      method: this.method,
      url: this.url,
      headers: this.headers,
      queryParams: this.queryParams,
      body: this.body,
      bodyFormat: this.bodyFormat,
      auth: this.auth,
      timeout: this.timeout,
      followRedirects: this.followRedirects,
      validateSSL: this.validateSSL,
      metadata: this.metadata
    };
  }
}

// ========== Request Formatter ==========

class RequestFormatter {
  constructor(options = {}) {
    this.defaultHeaders = options.defaultHeaders || {};
    this.defaultTimeout = options.defaultTimeout || 30000;
  }

  // Parse from various inputs
  parse(input) {
    if (typeof input === 'string') {
      // Try to detect format
      if (input.startsWith('curl ')) {
        return this.parseCurl(input);
      } else if (input.startsWith('http://') || input.startsWith('https://')) {
        return this.parseUrl(input);
      } else if (input.startsWith('{') || input.startsWith('[')) {
        return this.parseJson(input);
      }
    }

    if (typeof input === 'object') {
      return new HttpRequest(input);
    }

    throw new Error('Unable to parse request input');
  }

  parseCurl(curlCommand) {
    // Simple curl parser
    const tokens = this._tokenizeCurl(curlCommand);
    const request = new HttpRequest({ method: 'GET' });

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];

      if (token === '-X' || token === '--request') {
        request.method = tokens[++i].toUpperCase();
      } else if (token === '-H' || token === '--header') {
        const header = tokens[++i];
        const [key, value] = header.split(':').map(s => s.trim());
        request.headers[key] = value;
      } else if (token === '-d' || token === '--data' || token === '--data-raw') {
        request.body = tokens[++i];
        request.method = 'POST';
      } else if (token === '-u' || token === '--user') {
        const credentials = tokens[++i];
        request.auth = { type: 'basic', credentials };
      } else if (token.startsWith('http')) {
        request.url = token;
      }
    }

    return request;
  }

  _tokenizeCurl(curlCommand) {
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of curlCommand) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) tokens.push(current);
    return tokens;
  }

  parseUrl(urlString) {
    try {
      const url = new URL(urlString);
      return new HttpRequest({
        method: 'GET',
        url: urlString,
        queryParams: Object.fromEntries(url.searchParams)
      });
    } catch (e) {
      throw new Error('Invalid URL');
    }
  }

  parseJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return new HttpRequest(data);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }

  // Format to various output formats
  format(request, formatType = FormatType.CURL) {
    const req = request instanceof HttpRequest ? request : new HttpRequest(request);

    switch (formatType) {
      case FormatType.CURL:
        return this.toCurl(req);
      case FormatType.FETCH:
        return this.toFetch(req);
      case FormatType.AXIOS:
        return this.toAxios(req);
      case FormatType.HTTP:
        return this.toHttp(req);
      case FormatType.PYTHON_REQUESTS:
        return this.toPythonRequests(req);
      case FormatType.NODE_NATIVE:
        return this.toNodeNative(req);
      case FormatType.WGET:
        return this.toWget(req);
      default:
        throw new Error(`Unknown format type: ${formatType}`);
    }
  }

  toCurl(request) {
    let curl = `curl -X ${request.method}`;

    // URL
    let url = request.url;
    if (Object.keys(request.queryParams).length > 0) {
      const params = new URLSearchParams(request.queryParams);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }
    curl += ` '${url}'`;

    // Headers
    for (const [key, value] of Object.entries(request.headers)) {
      curl += ` \\\n  -H '${key}: ${value}'`;
    }

    // Auth
    if (request.auth) {
      if (request.auth.type === 'basic') {
        curl += ` \\\n  -u '${request.auth.credentials}'`;
      } else if (request.auth.type === 'bearer') {
        curl += ` \\\n  -H 'Authorization: Bearer ${request.auth.token}'`;
      }
    }

    // Body
    if (request.body) {
      if (request.bodyFormat === BodyFormat.JSON) {
        curl += ` \\\n  -H 'Content-Type: application/json'`;
        curl += ` \\\n  -d '${typeof request.body === 'string' ? request.body : JSON.stringify(request.body)}'`;
      } else {
        curl += ` \\\n  -d '${request.body}'`;
      }
    }

    return curl;
  }

  toFetch(request) {
    const options = {
      method: request.method
    };

    // Headers
    if (Object.keys(request.headers).length > 0) {
      options.headers = request.headers;
    }

    // Auth
    if (request.auth) {
      if (request.auth.type === 'basic') {
        const encoded = Buffer.from(request.auth.credentials).toString('base64');
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Basic ${encoded}`;
      } else if (request.auth.type === 'bearer') {
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${request.auth.token}`;
      }
    }

    // Body
    if (request.body && !['GET', 'HEAD'].includes(request.method)) {
      if (request.bodyFormat === BodyFormat.JSON) {
        options.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        options.headers = options.headers || {};
        options.headers['Content-Type'] = 'application/json';
      } else {
        options.body = request.body;
      }
    }

    // Build URL with params
    let url = request.url;
    if (Object.keys(request.queryParams).length > 0) {
      const params = new URLSearchParams(request.queryParams);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    return `fetch('${url}', ${JSON.stringify(options, null, 2)})`;
  }

  toAxios(request) {
    let url = request.url;

    // Build URL with params
    if (Object.keys(request.queryParams).length > 0) {
      const params = new URLSearchParams(request.queryParams);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    const config = {
      method: request.method.toLowerCase(),
      url
    };

    // Headers
    if (Object.keys(request.headers).length > 0) {
      config.headers = request.headers;
    }

    // Auth
    if (request.auth) {
      if (request.auth.type === 'basic') {
        const [username, password] = request.auth.credentials.split(':');
        config.auth = { username, password };
      }
    }

    // Body
    if (request.body && !['GET', 'HEAD'].includes(request.method)) {
      config.data = request.body;
    }

    return `axios(${JSON.stringify(config, null, 2)})`;
  }

  toHttp(request) {
    let lines = [];

    // Request line
    let url = request.url;
    if (Object.keys(request.queryParams).length > 0) {
      const params = new URLSearchParams(request.queryParams);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }
    lines.push(`${request.method} ${url} HTTP/1.1`);

    // Host header
    try {
      const parsed = new URL(request.url);
      lines.push(`Host: ${parsed.host}`);
    } catch (e) {}

    // Headers
    for (const [key, value] of Object.entries(request.headers)) {
      lines.push(`${key}: ${value}`);
    }

    // Auth
    if (request.auth && request.auth.type === 'basic') {
      const encoded = Buffer.from(request.auth.credentials).toString('base64');
      lines.push(`Authorization: Basic ${encoded}`);
    }

    // Body
    if (request.body && !['GET', 'HEAD'].includes(request.method)) {
      lines.push('');
      lines.push(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
    }

    return lines.join('\n');
  }

  toPythonRequests(request) {
    let url = request.url;

    // Build URL with params
    if (Object.keys(request.queryParams).length > 0) {
      url += (url.includes('?') ? '&' : '?') + new URLSearchParams(request.queryParams).toString();
    }

    let code = `requests.${request.method.toLowerCase()}('${url}'`;

    // Params
    if (Object.keys(request.queryParams).length > 0) {
      code += `,\n    params=${JSON.stringify(request.queryParams)}`;
    }

    // Headers
    if (Object.keys(request.headers).length > 0) {
      code += `,\n    headers=${JSON.stringify(request.headers)}`;
    }

    // Auth
    if (request.auth && request.auth.type === 'basic') {
      const [username, password] = request.auth.credentials.split(':');
      code += `,\n    auth=('${username}', '${password}')`;
    }

    // Body
    if (request.body && !['GET', 'HEAD'].includes(request.method)) {
      if (request.bodyFormat === BodyFormat.JSON) {
        code += `,\n    json=${typeof request.body === 'string' ? request.body : JSON.stringify(request.body)}`;
      } else {
        code += `,\n    data='${request.body}'`;
      }
    }

    code += ')';
    return code;
  }

  toNodeNative(request) {
    const url = new URL(request.url);

    const options = {
      method: request.method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || (url.protocol === 'https:' ? 443 : 80)
    };

    // Headers
    if (Object.keys(request.headers).length > 0) {
      options.headers = request.headers;
    }

    // Auth
    if (request.auth && request.auth.type === 'basic') {
      const encoded = Buffer.from(request.auth.credentials).toString('base64');
      options.headers = options.headers || {};
      options.headers['Authorization'] = `Basic ${encoded}`;
    }

    let code = `const https = require('https');\n\n`;
    code += `const options = ${JSON.stringify(options, null, 2)};\n\n`;
    code += `const req = https.request(options, (res) => {\n`;
    code += `  let data = '';\n`;
    code += `  res.on('data', (chunk) => { data += chunk; });\n`;
    code += `  res.on('end', () => { console.log(data); });\n`;
    code += `});\n\n`;

    if (request.body) {
      code += `req.write('${typeof request.body === 'string' ? request.body : JSON.stringify(request.body)}');\n`;
    }

    code += `req.end();`;
    return code;
  }

  toWget(request) {
    let wget = 'wget';

    // Method
    if (request.method !== 'GET') {
      wget += ` --method=${request.method}`;
    }

    // URL
    let url = request.url;
    if (Object.keys(request.queryParams).length > 0) {
      const params = new URLSearchParams(request.queryParams);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }
    wget += ` '${url}'`;

    // Headers
    for (const [key, value] of Object.entries(request.headers)) {
      wget += ` \\\n  --header='${key}: ${value}'`;
    }

    // Auth
    if (request.auth && request.auth.type === 'basic') {
      wget += ` \\\n  --user='${request.auth.credentials.split(':')[0]}'`;
      wget += ` \\\n  --password='${request.auth.credentials.split(':')[1] || ''}'`;
    }

    // Body
    if (request.body) {
      wget += ` \\\n  --post-data='${request.body}'`;
    }

    return wget;
  }
}

// ========== Request Validator ==========

class RequestValidator {
  validate(request) {
    const errors = [];

    // Validate method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(request.method)) {
      errors.push(`Invalid HTTP method: ${request.method}`);
    }

    // Validate URL
    try {
      new URL(request.url);
    } catch (e) {
      errors.push(`Invalid URL: ${request.url}`);
    }

    // Validate headers
    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        if (key.includes(' ') || key.includes(':')) {
          errors.push(`Invalid header name: ${key}`);
        }
      }
    }

    // Validate body for GET/HEAD
    if (['GET', 'HEAD'].includes(request.method) && request.body) {
      errors.push(`Body not allowed for ${request.method} requests`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const formatter = new RequestFormatter();

  switch (command) {
    case 'curl':
      const curlInput = args.slice(1).join(' ');
      if (curlInput) {
        const parsed = formatter.parse(curlInput);
        console.log('Parsed Request:');
        console.log(JSON.stringify(parsed.toJSON(), null, 2));
      }
      break;

    case 'format':
      const formatType = args[1] || 'curl';
      const input = args.slice(2).join(' ');

      if (input.startsWith('curl ')) {
        const parsed = formatter.parse(input);
        console.log(formatter.format(parsed, formatType));
      } else {
        try {
          const parsed = JSON.parse(input);
          console.log(formatter.format(parsed, formatType));
        } catch (e) {
          console.log('Usage: node request-formatter.js format <format> <curl-command-or-json>');
        }
      }
      break;

    case 'validate':
      const validateInput = args.slice(1).join(' ');
      let validateParsed;
      try {
        validateParsed = formatter.parse(validateInput);
      } catch (e) {
        console.log('Parse error:', e.message);
        break;
      }

      const validator = new RequestValidator();
      const result = validator.validate(validateParsed);
      console.log('Validation result:', JSON.stringify(result, null, 2));
      break;

    case 'example':
      const exampleFormat = args[1] || 'curl';
      const exampleRequest = new HttpRequest({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        queryParams: {
          page: '1',
          limit: '10'
        },
        body: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        auth: {
          type: 'bearer',
          token: 'your-token-here'
        }
      });

      console.log(formatter.format(exampleRequest, exampleFormat));
      break;

    default:
      console.log('Usage:');
      console.log('  node request-formatter.js curl <curl-command>       - Parse curl command');
      console.log('  node request-formatter.js format <format> <input>   - Format request');
      console.log('  node request-formatter.js validate <input>        - Validate request');
      console.log('  node request-formatter.js example [format]         - Show example');
      console.log('\nFormats:', Object.values(FormatType).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  RequestFormatter,
  RequestValidator,
  HttpRequest,
  FormatType,
  BodyFormat
};
