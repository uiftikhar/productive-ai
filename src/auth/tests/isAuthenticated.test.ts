import type { NextFunction, Request, Response } from 'express';

import { IUser } from '../../database/index';
import { isAuthenticated } from '../middlewares/index';

interface AuthenticatedRequest extends Request {
  user: IUser;
}

describe('isAuthenticated middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Reset mocks before each test
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  // Helper that simulates an authenticated request.
  // This function sets a dummy user on `this` and returns true.
  function fakeIsAuthenticatedTrue(
    this: AuthenticatedRequest,
  ): this is AuthenticatedRequest {
    this.user = {
      _id: '123', // dummy _id value
      email: 'test@example.com',
      password: 'dummyPassword',
      role: 'user',
    } as IUser;
    return true;
  }

  // Helper that simulates an unauthenticated request.
  function fakeIsAuthenticatedFalse(
    this: AuthenticatedRequest,
  ): this is AuthenticatedRequest {
    return false;
  }

  it('calls next if req.isAuthenticated returns true', () => {
    // Assign our helper function to req.isAuthenticated
    (mockReq as Request).isAuthenticated = fakeIsAuthenticatedTrue;

    // Invoke the middleware
    isAuthenticated(mockReq as Request, mockRes as Response, mockNext);

    // Verify that next() was called and no response was sent
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('sends 401 if req.isAuthenticated returns false', () => {
    (mockReq as Request).isAuthenticated = fakeIsAuthenticatedFalse;

    isAuthenticated(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
  });

  it('sends 401 if req.isAuthenticated is undefined', () => {
    // Ensure isAuthenticated is not defined.
    delete mockReq.isAuthenticated;

    isAuthenticated(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
  });
});
