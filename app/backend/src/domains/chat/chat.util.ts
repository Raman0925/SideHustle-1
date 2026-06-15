
export function mapTierToModelRouterTier(tier: 'fast' | 'balanced' | 'powerful'): 'cheap' | 'premium' {
  return tier === 'powerful' ? 'premium' : 'cheap';
}
