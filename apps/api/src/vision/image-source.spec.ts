import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpUrl, isPrivateIp, stripDataUrlPrefix } from './image-source';

describe('image-source (anti-SSRF)', () => {
  describe('isPrivateIp', () => {
    it.each([
      ['127.0.0.1', true], // loopback
      ['10.1.2.3', true], // 10/8
      ['172.16.0.1', true], // 172.16/12
      ['172.31.255.255', true], // 172.16/12 borda
      ['192.168.0.1', true], // 192.168/16
      ['169.254.169.254', true], // metadata cloud
      ['100.64.0.1', true], // CGNAT
      ['0.0.0.0', true], // unspecified
      ['8.8.8.8', false], // público
      ['1.1.1.1', false], // público
      ['172.32.0.1', false], // fora do 172.16/12
    ])('IPv4 %s → privado=%s', (ip, expected) => {
      expect(isPrivateIp(ip)).toBe(expected);
    });

    it.each([
      ['::1', true], // loopback
      ['::', true], // unspecified
      ['fc00::1', true], // unique local
      ['fd12:3456::1', true], // unique local
      ['fe80::1', true], // link-local
      ['::ffff:127.0.0.1', true], // IPv4 mapeado privado
      ['::ffff:8.8.8.8', false], // IPv4 mapeado público
      ['2606:4700:4700::1111', false], // público (Cloudflare)
    ])('IPv6 %s → privado=%s', (ip, expected) => {
      expect(isPrivateIp(ip)).toBe(expected);
    });

    it('trata string não-IP como privada (fail-safe)', () => {
      expect(isPrivateIp('not-an-ip')).toBe(true);
    });
  });

  describe('assertPublicHttpUrl', () => {
    it('rejeita URL malformada', async () => {
      await expect(assertPublicHttpUrl('não é url')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita protocolo não-http (file://)', async () => {
      await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita IP privado literal sem tocar em DNS', async () => {
      await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
        /não permitido/,
      );
    });

    it('rejeita localhost via IP literal', async () => {
      await expect(assertPublicHttpUrl('http://127.0.0.1:11434')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('aceita IP público literal', async () => {
      await expect(assertPublicHttpUrl('https://1.1.1.1/foo.jpg')).resolves.toBeUndefined();
    });
  });

  describe('stripDataUrlPrefix', () => {
    it('remove prefixo data URL', () => {
      expect(stripDataUrlPrefix('data:image/png;base64,AAAB')).toBe('AAAB');
    });
    it('mantém base64 puro inalterado', () => {
      expect(stripDataUrlPrefix('AAAB')).toBe('AAAB');
    });
  });
});
