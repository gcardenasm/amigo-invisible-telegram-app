export type RoomStatus = 'open' | 'drawn';

export interface WishlistItemDto {
  id: string;
  title: string;
  url: string;
  notes: string;
  createdAt: string;
}

export interface ParticipantDto {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  hasJoinedTelegram: boolean;
  botReachable: boolean;
  isOrganizer: boolean;
  isMe: boolean;
  claimToken: string | null; // Solo visible para el organizador si aún no se ha unido
  wishlistCount: number;
  notifiedAt: string | null;
}

export interface ExclusionDto {
  id: string;
  giverId: string;
  excludedReceiverId: string;
}

export interface SecretSantaTargetDto {
  participantId: string;
  displayName: string;
  telegramUsername: string | null;
  wishlist: WishlistItemDto[];
}

export interface RoomSummaryDto {
  id: string;
  code: string;
  title: string;
  maxBudget: number | null;
  currency: string;
  revealDate: string;
  notes: string;
  status: RoomStatus;
  participantCount: number;
  isOrganizer: boolean;
  myBotReachable: boolean;
  drawnAt: string | null;
}

export interface RoomDetailDto {
  room: RoomSummaryDto;
  me: {
    participantId: string;
    displayName: string;
    botReachable: boolean;
    wishlist: WishlistItemDto[];
  };
  participants: ParticipantDto[];
  exclusions: ExclusionDto[];
  myTarget: SecretSantaTargetDto | null;
  botUsername: string;
}

export interface ExclusionRule {
  giverId: string;
  excludedReceiverId: string;
}

export type DrawResult =
  | { ok: true; assignments: Record<string, string> }
  | { ok: false; error: string };
