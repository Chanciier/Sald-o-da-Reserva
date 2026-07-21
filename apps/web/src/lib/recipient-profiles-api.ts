import { apiFetch } from './cart-api';
import type {
  CreateRecipientProfileInput,
  CreateSavedAddressInput,
  RecipientProfile,
  SavedAddress,
} from '@/types/recipient-profile';

export const getRecipientProfiles = (token: string) =>
  apiFetch<RecipientProfile[]>('/recipient-profiles', token);

export const createRecipientProfile = (token: string, body: CreateRecipientProfileInput) =>
  apiFetch<RecipientProfile>('/recipient-profiles', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const addSavedAddress = (
  token: string,
  recipientProfileId: string,
  body: CreateSavedAddressInput,
) =>
  apiFetch<SavedAddress>(`/recipient-profiles/${recipientProfileId}/addresses`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
