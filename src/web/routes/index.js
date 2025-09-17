import { Router } from 'express';
import authRoutes from './auth.js';
import adminRoutes from './admin.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.use(authRoutes);
router.use(adminRoutes);

export default router;
