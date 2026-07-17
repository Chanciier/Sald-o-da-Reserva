import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomBytes } from 'crypto';

/**
 * Upload dos documentos gerados pelo Print Center (etiquetas de retirada) para
 * o mesmo bucket S3 já usado pelo StorageService, mas sob prefixo próprio
 * (`print-jobs/`) e sem passar pela tabela `Image` — esses arquivos não são
 * fotos de produto/usuário/categoria/banner, então não reaproveitamos
 * StorageService.uploadOne diretamente.
 */
@Injectable()
export class PrintStorageService {
  private readonly logger = new Logger(PrintStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('AWS_ENDPOINT_URL');
    this.s3 = new S3Client({
      region: config.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    this.bucket = config.get<string>('AWS_BUCKET_NAME', 'saldao-da-reserva');
    this.baseUrl = config.get<string>('CDN_URL', `https://${this.bucket}.s3.amazonaws.com`);
  }

  async uploadPng(buffer: Buffer, folder: 'print-jobs'): Promise<string> {
    const key = `${folder}/${Date.now()}-${randomBytes(8).toString('hex')}.png`;

    await new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        CacheControl: 'no-cache',
      },
    }).done();

    this.logger.log(`Uploaded ${key} (${buffer.length} bytes)`);
    return `${this.baseUrl}/${key}`;
  }
}
