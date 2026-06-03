import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redisService: RedisService) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<void> {
    const redisKey = `rl:${key}`;

    try {
      const count = await this.redisService.increment(redisKey, windowSeconds);
      if (count > limit) {
        throw new HttpException(
          { message: 'Muitas tentativas. Tente novamente em breve.', retryAfter: windowSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Fail open: if Redis is unavailable, don't block legitimate users
      this.logger.error('Rate limit check failed, failing open', (err as Error).message);
    }
  }
}
