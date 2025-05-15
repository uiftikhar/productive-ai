import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { email } });
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    return user;
  }

  async login(user: User) {
    const payload = { sub: user.id, email: user.email };
    
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('auth.jwtSecret'),
      expiresIn: this.configService.get('auth.jwtExpiresIn'),
    });
    
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('auth.jwtSecret'),
      expiresIn: this.configService.get('auth.refreshTokenExpiresIn'),
    });
    
    // Hash refresh token before storing
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.usersRepository.update(user.id, {
      refreshToken: hashedRefreshToken,
    });
    
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
      },
    };
  }

  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { email: userData.email },
    });
    
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    // Create new user
    const newUser = this.usersRepository.create({
      email: userData.email,
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
    });
    
    await this.usersRepository.save(newUser);
    
    // Return login tokens
    return this.login(newUser);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    // Verify refresh token
    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    // Generate new tokens
    return this.login(user);
  }

  async logout(userId: string) {
    await this.usersRepository.update(userId, { refreshToken: undefined });
    return { message: 'Logged out successfully' };
  }
} 