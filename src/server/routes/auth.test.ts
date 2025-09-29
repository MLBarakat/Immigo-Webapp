import request from 'supertest';
import app from '../index'; // Import the configured express app
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock Prisma client to avoid hitting the actual database in tests
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

describe('Auth Routes API', () => {

  beforeEach(() => {
    // Reset mocks before each test
    (prisma.user.findUnique as jest.Mock).mockClear();
    (prisma.user.create as jest.Mock).mockClear();
  });

  describe('POST /api/auth/register', () => {
    it('should create a new user and return 201 status', async () => {
      // Mock that the user does not exist
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      // Mock the creation of the user
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        // ... other user fields
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User created successfully');
      expect(response.body).toHaveProperty('token');
    });

    it('should return 409 if user already exists', async () => {
       // Mock that the user already exists
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: '1', email: 'test@example.com' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test User',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('message', 'User with this email already exists');
    });
  });
});