import { MetadataValidationService } from '../metadata-validation.service';
import { UserContextValidationError } from '../../types/context.types';
import { MemoryType } from '../../types/memory.types';
import { TemporalRelevanceModel } from '../../types/temporal.types';

describe('MetadataValidationService', () => {
  let service: MetadataValidationService;
  
  beforeEach(() => {
    service = new MetadataValidationService();
  });
  
  describe('validateMetadata', () => {
    test('should pass when all required fields are present', () => {
      // Arrange
      const metadata = {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3'
      };
      const requiredFields = ['field1', 'field2'];
      
      // Act & Assert
      expect(() => service.validateMetadata(metadata, requiredFields)).not.toThrow();
    });
    
    test('should throw when a required field is missing', () => {
      // Arrange
      const metadata = {
        field1: 'value1',
        // field2 is missing
        field3: 'value3'
      };
      const requiredFields = ['field1', 'field2'];
      
      // Act & Assert
      expect(() => service.validateMetadata(metadata, requiredFields))
        .toThrow(UserContextValidationError);
      expect(() => service.validateMetadata(metadata, requiredFields))
        .toThrow('Required metadata field "field2" is missing');
    });
    
    test('should pass when field exists but has falsy value', () => {
      // Arrange
      const metadata = {
        field1: 'value1',
        field2: 0, // Falsy but defined
        field3: false // Falsy but defined
      };
      const requiredFields = ['field1', 'field2', 'field3'];
      
      // Act & Assert
      expect(() => service.validateMetadata(metadata, requiredFields)).not.toThrow();
    });
  });
  
  describe('validateThemeMetadata', () => {
    test('should pass with valid theme metadata', () => {
      // Arrange
      const metadata = {
        themeIds: ['theme1', 'theme2'],
        themeNames: ['Theme One', 'Theme Two'],
        themeRelevance: {
          theme1: 0.8,
          theme2: 0.5
        }
      };
      
      // Act & Assert
      expect(() => service.validateThemeMetadata(metadata)).not.toThrow();
    });
    
    test('should throw when theme arrays have different lengths', () => {
      // Arrange
      const metadata = {
        themeIds: ['theme1', 'theme2'],
        themeNames: ['Theme One'] // Missing one name
      };
      
      // Act & Assert
      expect(() => service.validateThemeMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateThemeMetadata(metadata))
        .toThrow('Theme IDs and names arrays must have the same length');
    });
    
    test('should throw when theme relevance score is outside valid range', () => {
      // Arrange
      const metadata = {
        themeRelevance: {
          theme1: 1.2 // Should be between 0 and 1
        }
      };
      
      // Act & Assert
      expect(() => service.validateThemeMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateThemeMetadata(metadata))
        .toThrow('Theme relevance score must be between 0 and 1');
    });
    
    test('should pass when theme metadata fields are absent', () => {
      // Arrange
      const metadata = {
        // No theme fields
        otherField: 'value'
      };
      
      // Act & Assert
      expect(() => service.validateThemeMetadata(metadata)).not.toThrow();
    });
  });
  
  describe('validateRoleMetadata', () => {
    test('should pass with valid role metadata', () => {
      // Arrange
      const metadata = {
        roleRelevance: {
          user: 0.8,
          admin: 0.2
        }
      };
      
      // Act & Assert
      expect(() => service.validateRoleMetadata(metadata)).not.toThrow();
    });
    
    test('should throw when role relevance score is outside valid range', () => {
      // Arrange
      const metadata = {
        roleRelevance: {
          user: -0.1 // Should be between 0 and 1
        }
      };
      
      // Act & Assert
      expect(() => service.validateRoleMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateRoleMetadata(metadata))
        .toThrow('Role relevance score must be between 0 and 1');
    });
    
    test('should pass when role metadata fields are absent', () => {
      // Arrange
      const metadata = {
        // No role fields
        otherField: 'value'
      };
      
      // Act & Assert
      expect(() => service.validateRoleMetadata(metadata)).not.toThrow();
    });
  });
  
  describe('validateMemoryMetadata', () => {
    test('should pass with valid memory metadata', () => {
      // Arrange
      const metadata = {
        memoryType: MemoryType.EPISODIC,
        memoryStrength: 0.7
      };
      
      // Act & Assert
      expect(() => service.validateMemoryMetadata(metadata)).not.toThrow();
    });
    
    test('should throw with invalid memory type', () => {
      // Arrange
      const metadata = {
        memoryType: 'INVALID_TYPE'
      };
      
      // Act & Assert
      expect(() => service.validateMemoryMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateMemoryMetadata(metadata))
        .toThrow('Invalid memory type');
    });
    
    test('should throw when memory strength is outside valid range', () => {
      // Arrange
      const metadata = {
        memoryStrength: 1.5 // Should be between 0 and 1
      };
      
      // Act & Assert
      expect(() => service.validateMemoryMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateMemoryMetadata(metadata))
        .toThrow('Memory strength must be between 0 and 1');
    });
    
    test('should pass when memory metadata fields are absent', () => {
      // Arrange
      const metadata = {
        // No memory fields
        otherField: 'value'
      };
      
      // Act & Assert
      expect(() => service.validateMemoryMetadata(metadata)).not.toThrow();
    });
  });
  
  describe('validateTemporalMetadata', () => {
    test('should pass with valid temporal metadata', () => {
      // Arrange
      const metadata = {
        temporalRelevanceModel: TemporalRelevanceModel.EXPONENTIAL_DECAY,
        decayRate: 0.05
      };
      
      // Act & Assert
      expect(() => service.validateTemporalMetadata(metadata)).not.toThrow();
    });
    
    test('should throw with invalid temporal relevance model', () => {
      // Arrange
      const metadata = {
        temporalRelevanceModel: 'INVALID_MODEL'
      };
      
      // Act & Assert
      expect(() => service.validateTemporalMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateTemporalMetadata(metadata))
        .toThrow('Invalid temporal relevance model');
    });
    
    test('should throw when decay rate is outside valid range', () => {
      // Arrange
      const metadata = {
        decayRate: 1.5 // Should be between 0 and 1
      };
      
      // Act & Assert
      expect(() => service.validateTemporalMetadata(metadata))
        .toThrow(UserContextValidationError);
      expect(() => service.validateTemporalMetadata(metadata))
        .toThrow('Decay rate must be between 0 and 1');
    });
    
    test('should pass when temporal metadata fields are absent', () => {
      // Arrange
      const metadata = {
        // No temporal fields
        otherField: 'value'
      };
      
      // Act & Assert
      expect(() => service.validateTemporalMetadata(metadata)).not.toThrow();
    });
  });
  
  describe('validateAllMetadata', () => {
    test('should validate all types of metadata', () => {
      // Arrange
      const metadata = {
        requiredField: 'value',
        themeIds: ['theme1'],
        themeNames: ['Theme One'],
        themeRelevance: { theme1: 0.8 },
        roleRelevance: { user: 0.9 },
        memoryType: MemoryType.SEMANTIC,
        memoryStrength: 0.6,
        temporalRelevanceModel: TemporalRelevanceModel.LINEAR_DECAY,
        decayRate: 0.1
      };
      
      // Spy on individual validation methods
      const validateMetadataSpy = jest.spyOn(service, 'validateMetadata');
      const validateThemeMetadataSpy = jest.spyOn(service, 'validateThemeMetadata');
      const validateRoleMetadataSpy = jest.spyOn(service, 'validateRoleMetadata');
      const validateMemoryMetadataSpy = jest.spyOn(service, 'validateMemoryMetadata');
      const validateTemporalMetadataSpy = jest.spyOn(service, 'validateTemporalMetadata');
      
      // Act
      service.validateAllMetadata(metadata, ['requiredField']);
      
      // Assert
      expect(validateMetadataSpy).toHaveBeenCalledWith(metadata, ['requiredField']);
      expect(validateThemeMetadataSpy).toHaveBeenCalledWith(metadata);
      expect(validateRoleMetadataSpy).toHaveBeenCalledWith(metadata);
      expect(validateMemoryMetadataSpy).toHaveBeenCalledWith(metadata);
      expect(validateTemporalMetadataSpy).toHaveBeenCalledWith(metadata);
    });
    
    test('should not call validateMetadata when no required fields', () => {
      // Arrange
      const metadata = { field: 'value' };
      
      // Spy on individual validation methods
      const validateMetadataSpy = jest.spyOn(service, 'validateMetadata');
      
      // Act
      service.validateAllMetadata(metadata);
      
      // Assert
      expect(validateMetadataSpy).not.toHaveBeenCalled();
    });
    
    test('should handle a metadata object that fails multiple validations', () => {
      // Arrange
      const metadata = {
        themeRelevance: { theme1: 1.2 }, // Invalid theme relevance
        memoryStrength: 1.5, // Invalid memory strength
      };
      
      // Act & Assert - will throw on the first validation that fails
      expect(() => service.validateAllMetadata(metadata))
        .toThrow(UserContextValidationError);
    });
  });
}); 