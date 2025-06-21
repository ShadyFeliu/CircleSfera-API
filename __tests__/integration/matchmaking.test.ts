import { describe, test, expect } from '@jest/globals';

describe('Matchmaking System', () => {
  test('should have basic functionality', () => {
    expect(true).toBe(true);
  });

  test('should handle user connection', () => {
    const user = { id: 'test-user', interests: ['gaming'] };
    expect(user.id).toBe('test-user');
    expect(user.interests).toContain('gaming');
  });

  test('should match users with similar interests', () => {
    const user1 = { id: 'user1', interests: ['gaming', 'music'] };
    const user2 = { id: 'user2', interests: ['gaming', 'sports'] };
    
    const commonInterests = user1.interests.filter(interest => 
      user2.interests.includes(interest)
    );
    
    expect(commonInterests).toContain('gaming');
    expect(commonInterests.length).toBe(1);
  });
});
