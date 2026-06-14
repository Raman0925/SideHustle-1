import { UserRepository } from './user.repository.js';

/**
 * User Service
 * Coordinates user-specific business logic.
 */
export class UserService {
  /**
   * @param {import('pg').Pool} pgPool
   */
  constructor(pgPool) {
    this.repository = new UserRepository(pgPool);
  }

  /**
   * Retrieves a user profile by ID
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getProfile(userId) {
    const profile = await this.repository.findById(userId);
    if (!profile) {
      const error = new Error('User profile not found.');
      error.statusCode = 404;
      throw error;
    }
    return profile;
  }

  /**
   * Updates a user profile
   * @param {string} userId
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async updateProfile(userId, updates) {
    // Add business rules or validations here if needed (e.g. sanitizing input)
    return this.repository.updateProfile(userId, updates);
  }
}
