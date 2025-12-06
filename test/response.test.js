/**
 * Response Helper Tests
 * Tests for HTTP response helper functions
 */

import { describe, it, expect } from 'vitest';
import { json, error } from '../src/shared/response.js';

describe('json', () => {
  it('should create JSON response with default 200 status', async () => {
    const response = json({ message: 'success' });
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const data = await response.json();
    expect(data).toEqual({ message: 'success' });
  });

  it('should create JSON response with custom status', async () => {
    const response = json({ created: true }, 201);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data).toEqual({ created: true });
  });

  it('should handle empty object', async () => {
    const response = json({});
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({});
  });

  it('should handle arrays', async () => {
    const response = json([1, 2, 3]);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual([1, 2, 3]);
  });

  it('should handle nested objects', async () => {
    const nested = {
      level1: {
        level2: {
          value: 'deep'
        }
      }
    };
    const response = json(nested);

    const data = await response.json();
    expect(data).toEqual(nested);
  });

  it('should handle null', async () => {
    const response = json(null);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toBeNull();
  });

  it('should handle boolean values', async () => {
    const response = json(true);

    const data = await response.json();
    expect(data).toBe(true);
  });

  it('should handle numeric values', async () => {
    const response = json(42);

    const data = await response.json();
    expect(data).toBe(42);
  });

  it('should handle string values', async () => {
    const response = json('just a string');

    const data = await response.json();
    expect(data).toBe('just a string');
  });

  it('should handle special characters in strings', async () => {
    const response = json({ text: 'Café ☕ & "quotes" <html>' });

    const data = await response.json();
    expect(data.text).toBe('Café ☕ & "quotes" <html>');
  });
});

describe('error', () => {
  it('should create error response with default 400 status', async () => {
    const response = error('Bad request');
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const data = await response.json();
    expect(data).toEqual({ error: 'Bad request' });
  });

  it('should create error response with custom status', async () => {
    const response = error('Not found', 404);
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data).toEqual({ error: 'Not found' });
  });

  it('should create 401 Unauthorized error', async () => {
    const response = error('Unauthorized', 401);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should create 403 Forbidden error', async () => {
    const response = error('Forbidden', 403);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data).toEqual({ error: 'Forbidden' });
  });

  it('should create 500 Internal Server Error', async () => {
    const response = error('Internal server error', 500);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data).toEqual({ error: 'Internal server error' });
  });

  it('should handle empty error message', async () => {
    const response = error('');
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toEqual({ error: '' });
  });

  it('should handle long error messages', async () => {
    const longMessage = 'Error: '.repeat(100);
    const response = error(longMessage);

    const data = await response.json();
    expect(data.error).toBe(longMessage);
  });

  it('should handle error message with special characters', async () => {
    const message = 'Erreur: Caractères spéciaux <>&"\'';
    const response = error(message);

    const data = await response.json();
    expect(data.error).toBe(message);
  });
});
