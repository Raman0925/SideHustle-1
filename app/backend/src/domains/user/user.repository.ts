import pg from 'pg';

/**
 * User Repository
 * Handles direct database operations on the public.profiles table.
 */
export interface UserRepository {
  findById(id: string): Promise<any>;
  updateProfile(id: string, data: { fullName: string | null; avatarUrl: string | null }): Promise<any>;
}

export function createUserRepository(pgPool: pg.Pool): UserRepository {
  /**
   * Find a user profile by UUID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async function findById(id: string): Promise<any> {
    const query = `
      SELECT id, email, full_name, avatar_url, updated_at 
      FROM public.profiles 
      WHERE id = $1
    `;
    const result = await pgPool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Update profile metadata
   * @param {string} id
   * @param {object} profileData
   * @param {string|null} profileData.fullName
   * @param {string|null} profileData.avatarUrl
   * @returns {Promise<object>} Updated profile
   */
  async function updateProfile(id: string, { fullName, avatarUrl }: { fullName: string | null; avatarUrl: string | null }): Promise<any> {
    const query = `
      UPDATE public.profiles 
      SET 
        full_name = COALESCE($2, full_name), 
        avatar_url = COALESCE($3, avatar_url), 
        updated_at = NOW() 
      WHERE id = $1 
      RETURNING id, email, full_name, avatar_url, updated_at
    `;
    const result = await pgPool.query(query, [id, fullName, avatarUrl]);
    return result.rows[0];
  }

  return {
    findById,
    updateProfile
  };
}
