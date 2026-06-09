import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Controller('content/faq')
export class FaqController {
  constructor(private readonly service: FaqService) {}

  @Public()
  @Get()
  findAll(@Query('category') category?: string) {
    return this.service.findAll(category);
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  findAllAdmin() {
    return this.service.findAllAdmin();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.service.create(dto);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
