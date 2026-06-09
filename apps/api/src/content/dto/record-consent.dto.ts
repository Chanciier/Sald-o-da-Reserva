import { IsArray, IsInt, IsString, Min } from 'class-validator';

export class RecordConsentDto {
  @IsArray()
  @IsString({ each: true })
  types: string[];

  @IsInt()
  @Min(1)
  documentVersion: number;
}
