import { IsString, Length } from 'class-validator';

export class PairDeviceDto {
  @IsString()
  @Length(4, 16)
  code: string;
}
