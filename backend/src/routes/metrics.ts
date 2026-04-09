import { Router } from 'express';
import { getMetrics } from '../lib/metrics';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).send('Error fetching metrics');
  }
});

export default router;
