// src/config/index.ts
// Use the environment variable if available, otherwise fallback to a dev value
export const API_URL: string = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';