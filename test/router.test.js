import { describe, it, expect } from 'vitest';
import { Router, json, error, corsHeaders } from '../src/lib/router.js';

describe('Router', () => {
  it('should match GET routes', async () => {
    const router = new Router();
    let called = false;

    router.get('/api/test', () => {
      called = true;
      return new Response('ok');
    });

    const request = new Request('http://localhost/api/test', { method: 'GET' });
    await router.handle(request, {}, {});

    expect(called).toBe(true);
  });

  it('should match POST routes', async () => {
    const router = new Router();
    let called = false;

    router.post('/api/create', () => {
      called = true;
      return new Response('created');
    });

    const request = new Request('http://localhost/api/create', { method: 'POST' });
    await router.handle(request, {}, {});

    expect(called).toBe(true);
  });

  it('should extract path parameters', async () => {
    const router = new Router();
    let capturedParams = null;

    router.get('/api/teams/:id', (req, env, ctx, params) => {
      capturedParams = params;
      return new Response('ok');
    });

    const request = new Request('http://localhost/api/teams/123', { method: 'GET' });
    await router.handle(request, {}, {});

    expect(capturedParams).toEqual({ id: '123' });
  });

  it('should return 404 for unmatched routes', async () => {
    const router = new Router();
    router.get('/api/exists', () => new Response('ok'));

    const request = new Request('http://localhost/api/notexists', { method: 'GET' });
    const response = await router.handle(request, {}, {});

    expect(response.status).toBe(404);
  });

  it('should return 404 for wrong HTTP method', async () => {
    const router = new Router();
    router.get('/api/test', () => new Response('ok'));

    const request = new Request('http://localhost/api/test', { method: 'POST' });
    const response = await router.handle(request, {}, {});

    expect(response.status).toBe(404);
  });
});

describe('json helper', () => {
  it('should return JSON response with correct content type', () => {
    const response = json({ message: 'hello' });

    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should serialize data to JSON', async () => {
    const data = { foo: 'bar', count: 42 };
    const response = json(data);
    const body = await response.json();

    expect(body).toEqual(data);
  });

  it('should use default status 200', () => {
    const response = json({});
    expect(response.status).toBe(200);
  });

  it('should accept custom status', () => {
    const response = json({}, 201);
    expect(response.status).toBe(201);
  });

  it('should accept custom headers', () => {
    const response = json({}, 200, { 'X-Custom': 'value' });
    expect(response.headers.get('X-Custom')).toBe('value');
  });
});

describe('error helper', () => {
  it('should return error response', async () => {
    const response = error('Something went wrong', 400);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Something went wrong');
  });

  it('should default to status 400', async () => {
    const response = error('Bad request');
    expect(response.status).toBe(400);
  });
});

describe('corsHeaders', () => {
  it('should return CORS headers', () => {
    const headers = corsHeaders();

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  it('should accept custom origin', () => {
    const headers = corsHeaders('https://example.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });
});
