const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function apiBaseUrl(configuredApiBaseUrl?: string): string {
  return (configuredApiBaseUrl ?? ENV_API_BASE_URL ?? '').replace(/\/$/, '');
}

export function apiUrl(path: string, configuredApiBaseUrl?: string): string {
  return `${apiBaseUrl(configuredApiBaseUrl)}${path}`;
}
