import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { CheckoutSavedProfilesFlagService } from '../feature-flags/checkout-saved-profiles-flag.service';
import { RecipientProfilesService } from './recipient-profiles.service';
import { CreateRecipientProfileDto } from './dto/create-recipient-profile.dto';
import { UpdateRecipientProfileDto } from './dto/update-recipient-profile.dto';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';
import { UpdateSavedAddressDto } from './dto/update-saved-address.dto';

@Controller('recipient-profiles')
export class RecipientProfilesController {
  constructor(
    private readonly profiles: RecipientProfilesService,
    private readonly flag: CheckoutSavedProfilesFlagService,
  ) {}

  // Enquanto a flag estiver off para este usuário, a feature nem deve parecer
  // existir — 404 genérico, no mesmo espírito do 404 usado para perfil de
  // outro dono (não vaza a existência do recurso).
  private async assertEnabled(user: AuthenticatedUser) {
    const enabled = await this.flag.isEnabledForUser(user.id, user.role);
    if (!enabled) throw new NotFoundException();
  }

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    await this.assertEnabled(user);
    return this.profiles.findAll(user.id);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.assertEnabled(user);
    return this.profiles.findOne(user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecipientProfileDto) {
    await this.assertEnabled(user);
    return this.profiles.create(user.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecipientProfileDto,
  ) {
    await this.assertEnabled(user);
    return this.profiles.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.assertEnabled(user);
    return this.profiles.remove(user.id, id);
  }

  @Post(':id/addresses')
  @HttpCode(HttpStatus.CREATED)
  async addAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSavedAddressDto,
  ) {
    await this.assertEnabled(user);
    return this.profiles.addAddress(user.id, id, dto);
  }

  @Patch(':id/addresses/:addressId')
  async updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateSavedAddressDto,
  ) {
    await this.assertEnabled(user);
    return this.profiles.updateAddress(user.id, id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @HttpCode(HttpStatus.OK)
  async removeAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    await this.assertEnabled(user);
    return this.profiles.removeAddress(user.id, id, addressId);
  }
}
