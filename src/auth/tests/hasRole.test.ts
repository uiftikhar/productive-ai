import type { NextFunction, Request, Response } from 'express';

import { hasRole } from '../middlewares/index.ts';

describe('hasRole middleware', () => {
  let mockReq: Partial<Request>;
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

  it('calls next if the user has the required role', () => {
    mockReq.user = { role: 'admin' };

    const middleware = hasRole('admin');
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('returns 403 if the user does not have the required role', () => {
    mockReq.user = { role: 'user' };

    const middleware = hasRole('admin');
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Forbidden: Insufficient role',
    });
  });

  it('returns 403 if user is undefined', () => {
    mockReq.user = undefined;

    const middleware = hasRole('admin');
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Forbidden: Insufficient role',
    });
  });
});
