import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

/** Wrapper fino sobre `qrcode` — gera o QR localmente, sem depender de API pública. */
@Injectable()
export class QrCodeService {
  toPngBuffer(data: string, size = 220): Promise<Buffer> {
    return QRCode.toBuffer(data, { type: 'png', width: size, margin: 1 });
  }
}
