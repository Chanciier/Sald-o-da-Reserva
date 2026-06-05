import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePixPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;
}
