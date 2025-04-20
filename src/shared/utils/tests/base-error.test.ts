import { 
  BaseError, 
  NotFoundError, 
  ValidationError, 
  ConfigurationError, 
  ServiceError 
} from '../base-error';

describe('BaseError', () => {
  it('should extend Error', () => {
    const error = new BaseError('Test error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set message correctly', () => {
    const error = new BaseError('Test error');
    expect(error.message).toBe('Test error');
  });

  it('should set name correctly', () => {
    const error = new BaseError('Test error');
    expect(error.name).toBe('BaseError');
  });

  it('should set custom name when provided', () => {
    const error = new BaseError('Test error', { name: 'CustomError' });
    expect(error.name).toBe('CustomError');
  });

  it('should set cause when provided', () => {
    const cause = new Error('Original error');
    const error = new BaseError('Test error', { cause });
    expect(error.cause).toBe(cause);
  });

  it('should set statusCode when provided', () => {
    const error = new BaseError('Test error', { statusCode: 418 });
    expect(error.statusCode).toBe(418);
  });
});

describe('NotFoundError', () => {
  it('should extend BaseError', () => {
    const error = new NotFoundError('Test error');
    expect(error).toBeInstanceOf(BaseError);
  });

  it('should set statusCode to 404', () => {
    const error = new NotFoundError('Test error');
    expect(error.statusCode).toBe(404);
  });
});

describe('ValidationError', () => {
  it('should extend BaseError', () => {
    const error = new ValidationError('Test error');
    expect(error).toBeInstanceOf(BaseError);
  });

  it('should set statusCode to 400', () => {
    const error = new ValidationError('Test error');
    expect(error.statusCode).toBe(400);
  });
});

describe('ConfigurationError', () => {
  it('should extend BaseError', () => {
    const error = new ConfigurationError('Test error');
    expect(error).toBeInstanceOf(BaseError);
  });

  it('should set statusCode to 500', () => {
    const error = new ConfigurationError('Test error');
    expect(error.statusCode).toBe(500);
  });
});

describe('ServiceError', () => {
  it('should extend BaseError', () => {
    const error = new ServiceError('Test error');
    expect(error).toBeInstanceOf(BaseError);
  });

  it('should set statusCode to 500', () => {
    const error = new ServiceError('Test error');
    expect(error.statusCode).toBe(500);
  });
}); 