import { describe, expect, it } from 'vitest';
import {
  buildAssignmentMessageHtml,
  buildInviteMessageHtml,
  buildInviteStartAppUrl,
  buildRevealSummaryHtml,
  normalizeBotUsername
} from '../src/worker/telegram';

describe('telegram helpers', () => {
  it('normaliza BOT_USERNAME quitando @, espacios y prefijos t.me', () => {
    expect(normalizeBotUsername('MiAmigoInvisibleBot')).toBe('MiAmigoInvisibleBot');
    expect(normalizeBotUsername('@MiAmigoInvisibleBot')).toBe('MiAmigoInvisibleBot');
    expect(normalizeBotUsername('  @@MiAmigoInvisibleBot  ')).toBe('MiAmigoInvisibleBot');
    expect(normalizeBotUsername('https://t.me/MiAmigoInvisibleBot')).toBe('MiAmigoInvisibleBot');
    expect(normalizeBotUsername('https://t.me/@MiAmigoInvisibleBot?start=1')).toBe(
      'MiAmigoInvisibleBot'
    );
  });

  it('genera URLs startapp válidas sin @ aunque BOT_USERNAME lo incluya', () => {
    expect(buildInviteStartAppUrl('@MiAmigoInvisibleBot', 'join_PWVN4QBB')).toBe(
      'https://t.me/MiAmigoInvisibleBot?startapp=join_PWVN4QBB'
    );
  });

  it('escapa HTML en el mensaje de invitación interactiva', () => {
    const html = buildInviteMessageHtml({
      roomTitle: 'Navidad <2026> & Amigos',
      maxBudget: 30,
      currency: 'EUR',
      revealDate: '2026-12-24',
      notes: 'Casa de <Marta>',
      recipientName: 'Ana & Luis'
    });

    expect(html).toContain('Navidad &lt;2026&gt; &amp; Amigos');
    expect(html).toContain('Ana &amp; Luis');
    expect(html).toContain('Casa de &lt;Marta&gt;');
    expect(html).toContain('30 €');
    expect(html).toContain('24 de diciembre de 2026');
  });

  it('incluye tallas, alergias y qué evitar en el mensaje de asignación', () => {
    const html = buildAssignmentMessageHtml({
      roomTitle: 'Navidad',
      targetName: 'Laura',
      targetUsername: 'laura_tg',
      maxBudget: 25,
      currency: 'EUR',
      revealDate: '2026-12-24',
      notes: '',
      sizes: 'M / 39',
      allergies: 'Frutos secos',
      dislikes: 'Tazas & colonias',
      wishlist: []
    });

    expect(html).toContain('M / 39');
    expect(html).toContain('Frutos secos');
    expect(html).toContain('Tazas &amp; colonias');
  });

  it('genera y escapa el resumen de revelación final', () => {
    const html = buildRevealSummaryHtml({
      roomTitle: 'Grupo <1>',
      pairs: [
        { giverName: 'Ana', receiverName: 'Carlos & Sofía' },
        { giverName: 'Carlos & Sofía', receiverName: 'Ana' }
      ]
    });

    expect(html).toContain('Grupo &lt;1&gt;');
    expect(html).toContain('Carlos &amp; Sofía');
    expect(html).toContain('🎁→');
  });
});
