/**
 * User Repository
 * Handles direct database operations on the public.profiles table.
 */
export class UserRepository {
  /**
   * @param {import('pg').Pool} pgPool
   */
  constructor(pgPool) {
    this.db = pgPool;
  }

  /**
   * Find a user profile by UUID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const query = `
      SELECT id, email, full_name, avatar_url, updated_at 
      FROM public.profiles 
      WHERE id = $1
    `;
    const result = await this.db.query(query, [id]);
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
  async updateProfile(id, { fullName, avatarUrl }) {
    const query = `
      UPDATE public.profiles 
      SET 
        full_name = COALESCE($2, full_name), 
        avatar_url = COALESCE($3, avatar_url), 
        updated_at = NOW() 
      WHERE id = $1 
      RETURNING id, email, full_name, avatar_url, updated_at
    `;
    const result = await this.db.query(query, [id, fullName, avatarUrl]);
    return result.rows[0];
  }
}
