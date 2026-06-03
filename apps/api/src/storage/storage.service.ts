import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomBytes } from 'crypto';
import * as sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

export type StorageFolder = 'products' | 'users' | 'categories' | 'banners';

const RESIZE: Record<StorageFolder, { width: number; height: number; quality: number }> = {
  products: { width: 1920, height: 1920, quality: 80 },
  users: { width: 400, height: 400, quality: 85 },
  categories: { width: 1200, height: 600, quality: 80 },
  banners: { width: 1920, height: 600, quality: 85 },
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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

  async uploadMany(files: Express.Multer.File[], folder: StorageFolder) {
    return Promise.all(files.map((f) => this.uploadOne(f, folder)));
  }

  private async uploadOne(file: Express.Multer.File, folder: StorageFolder) {
    const cfg = RESIZE[folder];

    const { data, info } = await sharp(file.buffer)
      .resize(cfg.width, cfg.height, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: cfg.quality })
      .toBuffer({ resolveWithObject: true });

    const key = `${folder}/${Date.now()}-${randomBytes(8).toString('hex')}.webp`;

    await new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'image/webp',
        CacheControl: 'max-age=31536000, public',
      },
    }).done();

    this.logger.log(`Uploaded ${key} (${info.size} bytes)`);

    return this.prisma.image.create({
      data: {
        key,
        url: `${this.baseUrl}/${key}`,
        bucket: this.bucket,
        folder,
        size: info.size,
        mimeType: 'image/webp',
        width: info.width,
        height: info.height,
      },
    });
  }

  async deleteByKey(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    await this.prisma.image.deleteMany({ where: { key } });
    this.logger.log(`Deleted ${key}`);
  }

  async deleteManyByKeys(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
    await this.prisma.image.deleteMany({ where: { key: { in: keys } } });
    this.logger.log(`Deleted ${keys.length} image(s)`);
  }

  async connectImages(
    imageIds: string[],
    field: 'productId' | 'categoryId' | 'userId',
    entityId: string,
  ) {
    if (!imageIds.length) return;
    await this.prisma.image.updateMany({
      where: { id: { in: imageIds } },
      data: { [field]: entityId },
    });
  }
}
