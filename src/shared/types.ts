export type RoomStatus = 'open' | 'drawn' | 'revealed';

export type GiftStatus = 'pending' | 'bought' | 'wrapped';

export interface WishlistItemDto {
  id: string;
  title: string;
  url: string;
  notes: string;
  createdAt: string;
}

export interface AnonymousMessageDto {
  id: string;
  senderRole: 'giver' | 'receiver';
  body: string;
  createdAt: string;
}

export interface RevealedPairDto {
  giverName: string;
  receiverName: string;
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
  sizes: string;
  allergies: string;
  dislikes: string;
  wishlist: WishlistItemDto[];
  chatMessages: AnonymousMessageDto[];
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
  giftsReadyCount: number;
  hasLinkedGroup: boolean;
  linkedGroupTitle: string;
  isOrganizer: boolean;
  myBotReachable: boolean;
  drawnAt: string | null;
  revealedAt: string | null;
}

export interface RoomDetailDto {
  room: RoomSummaryDto;
  me: {
    participantId: string;
    displayName: string;
    botReachable: boolean;
    sizes: string;
    allergies: string;
    dislikes: string;
    giftStatus: GiftStatus;
    wishlist: WishlistItemDto[];
  };
  participants: ParticipantDto[];
  exclusions: ExclusionDto[];
  myTarget: SecretSantaTargetDto | null;
  santaMessages: AnonymousMessageDto[];
  revealedPairs: RevealedPairDto[] | null;
  botUsername: string;
}

export interface ExclusionRule {
  giverId: string;
  excludedReceiverId: string;
}

export type DrawResult =
  | { ok: true; assignments: Record<string, string> }
  | { ok: false; error: string };
