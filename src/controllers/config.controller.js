const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { JWT_SECRET } = require('../middleware/auth');

const GUEST_MENU_CODES = new Set(['mnu001', 'mnu_login', 'mnu_register', 'mnu_logout']);
const GUEST_MENU_NAMES = new Set(['login', 'register', 'logout']);
const GUEST_MENU_PATHS = new Set(['/login', '/register', '/logout']);

function readBearerToken(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7);
}

function isForcedGuestMenu(item, meta) {
  const code = String(item?.confCode || '').trim().toLowerCase();
  if (GUEST_MENU_CODES.has(code)) return true;

  const name = String(item?.confName || '').trim().toLowerCase();
  if (GUEST_MENU_NAMES.has(name)) return true;

  const path = String(meta?.path || meta?.route || item?.confValue || '').trim().toLowerCase();
  if (GUEST_MENU_PATHS.has(path)) return true;

  return false;
}

function parseMenuMeta(confValue) {
  if (!confValue) return {};
  const raw = String(confValue).trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    return { path: raw };
  }

  return {};
}

function toMenuResponse(item) {
  const meta = parseMenuMeta(item.confValue);
  const forcedGuest = isForcedGuestMenu(item, meta);
  const requiredRole = forcedGuest
    ? 'guest'
    : String(meta.requiredRole || 'user').toLowerCase();

  return {
    typCode: item.typCode,
    confCode: item.confCode,
    confName: item.confName,
    confDescription: item.confDescription || '',
    confValue: item.confValue || null,
    icon: String(meta.icon || item.confName || '?').charAt(0).toUpperCase(),
    openPath: meta.path || meta.route || item.confValue || '#',
    requiredRole
  };
}

async function resolveMenuViewer(req) {
  const token = readBearerToken(req);
  if (!token) return { isGuest: true };

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.type !== 'user') return { isGuest: true };

    const userId = String(payload?.userId || '');
    if (!userId) return { isGuest: true };

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true }
    });
    if (!user) return { isGuest: true };
    return { isGuest: false };
  } catch (err) {
    return { isGuest: true };
  }
}

exports.listMenu = asyncHandler(async (req, res) => {
  const viewer = await resolveMenuViewer(req);

  const rows = await prisma.configDetail.findMany({
    where: { typCode: 'MENU' },
    orderBy: [{ confCode: 'asc' }]
  });

  const visibleRows = viewer.isGuest
    ? rows.filter((item) => isForcedGuestMenu(item, parseMenuMeta(item.confValue)))
    : rows;

  return res.json(visibleRows.map((item) => toMenuResponse(item)));
});
