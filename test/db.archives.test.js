/**
 * Tests for archive database operations
 * Focus on pure functions that can be tested without database mocking
 */
import { describe, it, expect } from 'vitest';
import {
  calculateStats,
  generateDataHash,
  anonymizeMembers,
  anonymizePaymentEvents
} from '../src/database/db.archives.js';

// Sample test data
const sampleTeams = [
  { id: 1, name: 'Team Alpha', description: 'Test team', created_at: '2024-11-15T10:00:00Z', room_id: 1, member_count: 2 }
];

const sampleMembers = [
  { 
    id: 1, team_id: 1, first_name: 'Jean', last_name: 'Dupont', 
    email: 'jean@example.com', bac_level: 3, is_leader: 1, 
    food_diet: 'margherita', checked_in: 1, checked_in_at: '2024-12-07T18:00:00Z', 
    created_at: '2024-11-15T10:30:00Z', payment_status: 'paid', 
    payment_amount: 500, checkout_id: 'chk_123', transaction_id: 'txn_456' 
  },
  { 
    id: 2, team_id: 1, first_name: 'Marie', last_name: 'Martin', 
    email: 'marie@example.com', bac_level: 2, is_leader: 0, 
    food_diet: 'vegetarienne', checked_in: 0, checked_in_at: null, 
    created_at: '2024-11-15T11:00:00Z', payment_status: 'unpaid', 
    payment_amount: null, checkout_id: null, transaction_id: null 
  }
];

const samplePaymentEvents = [
  { 
    id: 1, member_id: 1, checkout_id: 'chk_123', 
    event_type: 'payment_completed', amount: 500, 
    tier: 'tier1', metadata: '{"email":"jean@example.com"}', 
    created_at: '2024-11-15T10:35:00Z' 
  }
];

describe('Archive Statistics Calculation', () => {
  describe('calculateStats', () => {
    it('should calculate total teams and participants', () => {
      const stats = calculateStats(sampleTeams, sampleMembers, samplePaymentEvents);
      
      expect(stats.total_teams).toBe(1);
      expect(stats.total_participants).toBe(2);
    });

    it('should calculate BAC level distribution', () => {
      const stats = calculateStats(sampleTeams, sampleMembers, samplePaymentEvents);
      
      expect(stats.participants_by_bac_level).toBeDefined();
      expect(stats.participants_by_bac_level['3']).toBe(1);
      expect(stats.participants_by_bac_level['2']).toBe(1);
    });

    it('should calculate food preference counts', () => {
      const stats = calculateStats(sampleTeams, sampleMembers, samplePaymentEvents);
      
      expect(stats.food_preferences).toBeDefined();
      expect(stats.food_preferences['margherita']).toBe(1);
      expect(stats.food_preferences['vegetarienne']).toBe(1);
    });

    it('should calculate attendance statistics', () => {
      const stats = calculateStats(sampleTeams, sampleMembers, samplePaymentEvents);
      
      expect(stats.attendance.checked_in).toBe(1);
      expect(stats.attendance.no_show).toBe(1);
    });

    it('should calculate payment statistics', () => {
      const stats = calculateStats(sampleTeams, sampleMembers, samplePaymentEvents);
      
      expect(stats.payments).toBeDefined();
      expect(stats.payments.total_revenue).toBe(500);
      expect(stats.payments.paid).toBe(1);
      expect(stats.payments.unpaid).toBe(1);
    });

    it('should calculate registration timeline', () => {
      const stats = calculateStats(sampleTeams, sampleMembers, samplePaymentEvents);
      
      expect(stats.registration_timeline).toBeDefined();
      expect(stats.registration_timeline['2024-11-15']).toBe(2);
    });

    it('should handle empty data', () => {
      const stats = calculateStats([], [], []);
      
      expect(stats.total_teams).toBe(0);
      expect(stats.total_participants).toBe(0);
      expect(stats.attendance.checked_in).toBe(0);
      expect(stats.payments.total_revenue).toBe(0);
    });
  });
});

describe('Data Hash Generation', () => {
  describe('generateDataHash', () => {
    it('should generate consistent hash for same data', () => {
      const data = { teams: sampleTeams, members: sampleMembers, events: samplePaymentEvents };
      const hash1 = generateDataHash(data);
      const hash2 = generateDataHash(data);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different data', () => {
      const data1 = { teams: [{ name: 'A' }], members: [], events: [] };
      const data2 = { teams: [{ name: 'B' }], members: [], events: [] };
      const hash1 = generateDataHash(data1);
      const hash2 = generateDataHash(data2);
      expect(hash1).not.toBe(hash2);
    });

    it('should generate hash of expected format', () => {
      const data = { teams: [], members: [], events: [] };
      const hash = generateDataHash(data);
      // Should be a hex string
      expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
      expect(hash.length).toBeGreaterThanOrEqual(8);
    });

    it('should handle complex nested data', () => {
      const complexData = {
        teams: sampleTeams,
        members: sampleMembers,
        events: samplePaymentEvents,
        nested: { deep: { value: 'test' } }
      };
      const hash = generateDataHash(complexData);
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThanOrEqual(8);
    });
  });
});

describe('GDPR Anonymization', () => {
  describe('anonymizeMembers', () => {
    it('should anonymize personal data in members', () => {
      const anonymized = anonymizeMembers(sampleMembers);
      
      expect(anonymized[0].first_name).toBe('Participant');
      expect(anonymized[0].last_name).toBe('');
      expect(anonymized[0].email).toBeNull();
    });

    it('should preserve non-sensitive data', () => {
      const anonymized = anonymizeMembers(sampleMembers);
      
      expect(anonymized[0].bac_level).toBe(3);
      expect(anonymized[0].is_leader).toBe(1);
      expect(anonymized[0].food_diet).toBe('margherita');
      expect(anonymized[0].checked_in).toBe(1);
      expect(anonymized[0].payment_status).toBe('paid');
      expect(anonymized[0].payment_amount).toBe(500);
    });

    it('should remove external references', () => {
      const anonymized = anonymizeMembers(sampleMembers);
      
      expect(anonymized[0].checkout_id).toBeNull();
      expect(anonymized[0].transaction_id).toBeNull();
    });

    it('should anonymize all members in array', () => {
      const anonymized = anonymizeMembers(sampleMembers);
      
      expect(anonymized.length).toBe(2);
      expect(anonymized[0].first_name).toBe('Participant');
      expect(anonymized[1].first_name).toBe('Participant');
      expect(anonymized[0].email).toBeNull();
      expect(anonymized[1].email).toBeNull();
    });

    it('should handle empty array', () => {
      const anonymized = anonymizeMembers([]);
      expect(anonymized).toEqual([]);
    });

    it('should preserve team_id for cross-reference', () => {
      const anonymized = anonymizeMembers(sampleMembers);
      
      expect(anonymized[0].team_id).toBe(1);
      expect(anonymized[1].team_id).toBe(1);
    });
  });

  describe('anonymizePaymentEvents', () => {
    it('should remove checkout_id from events', () => {
      const anonymized = anonymizePaymentEvents(samplePaymentEvents);
      
      expect(anonymized[0].checkout_id).toBeNull();
    });

    it('should remove metadata (may contain personal data)', () => {
      const anonymized = anonymizePaymentEvents(samplePaymentEvents);
      
      expect(anonymized[0].metadata).toBeNull();
    });

    it('should preserve non-sensitive event data', () => {
      const anonymized = anonymizePaymentEvents(samplePaymentEvents);
      
      expect(anonymized[0].event_type).toBe('payment_completed');
      expect(anonymized[0].amount).toBe(500);
      expect(anonymized[0].tier).toBe('tier1');
      expect(anonymized[0].member_id).toBe(1);
    });

    it('should handle empty array', () => {
      const anonymized = anonymizePaymentEvents([]);
      expect(anonymized).toEqual([]);
    });
  });
});

describe('Archive Data Integrity', () => {
  it('should maintain referential integrity after anonymization', () => {
    const anonymizedMembers = anonymizeMembers(sampleMembers);
    const anonymizedEvents = anonymizePaymentEvents(samplePaymentEvents);
    
    // Member IDs should still match payment events
    const memberIds = new Set(anonymizedMembers.map(m => m.id));
    for (const event of anonymizedEvents) {
      expect(memberIds.has(event.member_id)).toBe(true);
    }
  });

  it('should maintain team references after anonymization', () => {
    const anonymizedMembers = anonymizeMembers(sampleMembers);
    const teamIds = new Set(sampleTeams.map(t => t.id));
    
    for (const member of anonymizedMembers) {
      expect(teamIds.has(member.team_id)).toBe(true);
    }
  });
});
