import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
