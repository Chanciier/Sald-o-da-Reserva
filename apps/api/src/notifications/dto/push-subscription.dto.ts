import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @Length(20, 512)
  p256dh: string;

  @IsString()
  @Length(10, 512)
  auth: string;
}

export class SavePushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string;
}
