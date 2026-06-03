import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { StorageFolder, StorageService } from './storage.service';

const ALLOWED_FOLDERS: StorageFolder[] = ['products', 'users', 'categories', 'banners'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 10;

@Controller('uploads')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post(':folder')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      fileFilter(_req, file, cb) {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          return cb(new BadRequestException(`Tipo não permitido: ${file.mimetype}`), false);
        }
        cb(null, true);
      },
      limits: { fileSize: MAX_SIZE },
    }),
  )
  async upload(@Param('folder') folder: string, @UploadedFiles() files: Express.Multer.File[]) {
    if (!ALLOWED_FOLDERS.includes(folder as StorageFolder)) {
      throw new BadRequestException(`Pasta inválida. Permitidas: ${ALLOWED_FOLDERS.join(', ')}`);
    }
    if (!files?.length) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.storage.uploadMany(files, folder as StorageFolder);
  }

  @Delete(':folder/:filename')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async delete(@Param('folder') folder: string, @Param('filename') filename: string) {
    if (!ALLOWED_FOLDERS.includes(folder as StorageFolder)) {
      throw new BadRequestException('Pasta inválida.');
    }
    await this.storage.deleteByKey(`${folder}/${filename}`);
    return { message: 'Imagem excluída.' };
  }
}
