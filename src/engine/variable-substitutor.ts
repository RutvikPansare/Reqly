import { RequestConfig } from '../types/index.js';

export function substitute(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

export function substituteConfig(config: RequestConfig, variables: Record<string, string>): RequestConfig {
  const newConfig: RequestConfig = { ...config };
  
  if (config.url) {
    newConfig.url = substitute(config.url, variables);
  }

  if (config.headers) {
    newConfig.headers = {};
    for (const [k, v] of Object.entries(config.headers)) {
      newConfig.headers[k] = substitute(v, variables);
    }
  }

  if (config.params) {
    newConfig.params = {};
    for (const [k, v] of Object.entries(config.params)) {
      newConfig.params[k] = substitute(v, variables);
    }
  }

  if (typeof config.body === 'string') {
    newConfig.body = substitute(config.body, variables);
  } else if (config.body && typeof config.body === 'object') {
    // If it's an object, it shouldn't be substituted here in string form, 
    // but the executor JSON stringifies it later. Or we can JSON stringify, substitute, then parse back.
    // For now we assume body substitution is only supported on string bodies here.
  }

  return newConfig;
}
