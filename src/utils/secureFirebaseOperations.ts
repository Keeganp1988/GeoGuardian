// Secure Firebase operations wrapper with data sanitization and validation

import {
    setDoc,
    updateDoc,
    addDoc,
    DocumentReference,
    CollectionReference
} from 'firebase/firestore';
import { DataSanitizer, FirebaseSecurityValidator } from './dataSecurity';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';
import { getFirebaseAuth } from '../firebase/firebase';

// Secure Firebase operations class
export class SecureFirebaseOperations {
    // Secure setDoc operation with validation and sanitization
    static async secureSetDoc(
        docRef: DocumentReference,
        data: any,
        options?: { merge?: boolean }
    ): Promise<void> {
        try {
            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;

            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Extract collection name from document path
            const pathParts = docRef.path.split('/');
            const collection = pathParts[0];

            // Validate and sanitize data
            const validation = FirebaseSecurityValidator.validateFirestoreData(
                collection,
                data,
                userId
            );

            if (!validation.isValid) {
                const error = new Error(`Data validation failed: ${validation.errors.join(', ')}`);
                ErrorHandler.logError(
                    error,
                    ErrorCategory.VALIDATION,
                    ErrorSeverity.HIGH,
                    'SecureFirebaseOperations.secureSetDoc'
                );
                throw error;
            }

            // Perform the operation with sanitized data
            if (options) {
                await setDoc(docRef, validation.sanitizedData, options);
            } else {
                await setDoc(docRef, validation.sanitizedData);
            }

            // Document set successfully - logged via ErrorHandler if needed
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.FIREBASE,
                ErrorSeverity.HIGH,
                'SecureFirebaseOperations.secureSetDoc'
            );
            throw error;
        }
    }

    // Secure updateDoc operation with validation and sanitization
    static async secureUpdateDoc(
        docRef: DocumentReference,
        data: any
    ): Promise<void> {
        try {
            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;

            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Extract collection name from document path
            const pathParts = docRef.path.split('/');
            const collection = pathParts[0];

            // Validate and sanitize data
            const validation = FirebaseSecurityValidator.validateFirestoreData(
                collection,
                data,
                userId
            );

            if (!validation.isValid) {
                const error = new Error(`Data validation failed: ${validation.errors.join(', ')}`);
                ErrorHandler.logError(
                    error,
                    ErrorCategory.VALIDATION,
                    ErrorSeverity.HIGH,
                    'SecureFirebaseOperations.secureUpdateDoc'
                );
                throw error;
            }

            // Perform the operation with sanitized data
            await updateDoc(docRef, validation.sanitizedData);

            // Document updated successfully - logged via ErrorHandler if needed
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.FIREBASE,
                ErrorSeverity.HIGH,
                'SecureFirebaseOperations.secureUpdateDoc'
            );
            throw error;
        }
    }

    // Secure addDoc operation with validation and sanitization
    static async secureAddDoc(
        collectionRef: CollectionReference,
        data: any
    ): Promise<DocumentReference> {
        try {
            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;

            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Extract collection name from collection path
            const collection = collectionRef.path;

            // Validate and sanitize data
            const validation = FirebaseSecurityValidator.validateFirestoreData(
                collection,
                data,
                userId
            );

            if (!validation.isValid) {
                const error = new Error(`Data validation failed: ${validation.errors.join(', ')}`);
                ErrorHandler.logError(
                    error,
                    ErrorCategory.VALIDATION,
                    ErrorSeverity.HIGH,
                    'SecureFirebaseOperations.secureAddDoc'
                );
                throw error;
            }

            // Perform the operation with sanitized data
            const docRef = await addDoc(collectionRef, validation.sanitizedData);

            // Document added successfully - logged via ErrorHandler if needed
            return docRef;
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.FIREBASE,
                ErrorSeverity.HIGH,
                'SecureFirebaseOperations.secureAddDoc'
            );
            throw error;
        }
    }

    // Secure location update with enhanced validation
    static async secureLocationUpdate(
        docRef: DocumentReference,
        locationData: any,
        circleMembers: string[] = []
    ): Promise<void> {
        try {
            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;

            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Sanitize location data specifically
            const sanitizedLocation = DataSanitizer.sanitizeLocationData(locationData);
            if (!sanitizedLocation) {
                throw new Error('Invalid location data provided');
            }

            // Validate circle members array
            const sanitizedCircleMembers = circleMembers.filter(
                (memberId: any) => typeof memberId === 'string' && memberId.trim().length > 0
            );

            // Ensure user can only update their own location
            if (sanitizedLocation.userId && sanitizedLocation.userId !== userId) {
                throw new Error('Cannot update location for other users');
            }

            const finalData = {
                ...sanitizedLocation,
                userId,
                circleMembers: sanitizedCircleMembers,
                timestamp: new Date(),
            };

            await setDoc(docRef, finalData);

            // Location data updated successfully - logged via ErrorHandler if needed
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.LOCATION,
                ErrorSeverity.HIGH,
                'SecureFirebaseOperations.secureLocationUpdate'
            );
            throw error;
        }
    }

    // Secure user profile update with enhanced validation
    static async secureUserProfileUpdate(
        docRef: DocumentReference,
        profileData: any
    ): Promise<void> {
        try {
            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;

            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Sanitize profile data
            const sanitizedProfile = DataSanitizer.sanitizeObject(profileData, {
                maxLength: 200,
                trimWhitespace: true,
            });

            // Additional validation for profile fields
            const validatedProfile: any = {};

            if (sanitizedProfile.name) {
                if (sanitizedProfile.name.length < 2 || sanitizedProfile.name.length > 100) {
                    throw new Error('Name must be between 2 and 100 characters');
                }
                validatedProfile.name = sanitizedProfile.name;
            }

            if (sanitizedProfile.email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(sanitizedProfile.email)) {
                    throw new Error('Invalid email format');
                }
                validatedProfile.email = sanitizedProfile.email;
            }

            if (sanitizedProfile.phone) {
                // Basic phone validation - adjust regex as needed
                const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
                if (!phoneRegex.test(sanitizedProfile.phone.replace(/[\s\-\(\)]/g, ''))) {
                    throw new Error('Invalid phone number format');
                }
                validatedProfile.phone = sanitizedProfile.phone;
            }

            if (sanitizedProfile.profileImage) {
                // Validate profile image URL
                try {
                    new URL(sanitizedProfile.profileImage);
                    validatedProfile.profileImage = sanitizedProfile.profileImage;
                } catch {
                    throw new Error('Invalid profile image URL');
                }
            }

            // Add update timestamp
            validatedProfile.updatedAt = new Date();

            await updateDoc(docRef, validatedProfile);

            // User profile updated successfully - logged via ErrorHandler if needed
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.VALIDATION,
                ErrorSeverity.HIGH,
                'SecureFirebaseOperations.secureUserProfileUpdate'
            );
            throw error;
        }
    }

    // Secure emergency alert creation with validation
    static async secureEmergencyAlertCreation(
        collectionRef: CollectionReference,
        alertData: any
    ): Promise<DocumentReference> {
        try {
            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;

            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Validate alert data
            const sanitizedAlert: any = {
                userId,
                timestamp: new Date(),
                status: 'active',
            };

            // Validate and sanitize location
            if (alertData.location) {
                const sanitizedLocation = DataSanitizer.sanitizeLocationData(alertData.location);
                if (!sanitizedLocation) {
                    throw new Error('Invalid emergency alert location data');
                }
                sanitizedAlert.location = sanitizedLocation;
            } else {
                throw new Error('Emergency alert must include location data');
            }

            // Validate circle ID
            if (alertData.circleId && typeof alertData.circleId === 'string') {
                sanitizedAlert.circleId = alertData.circleId.trim();
            } else {
                throw new Error('Emergency alert must include valid circle ID');
            }

            // Sanitize optional message
            if (alertData.message) {
                sanitizedAlert.message = DataSanitizer.sanitizeInput(alertData.message, {
                    maxLength: 500,
                    trimWhitespace: true,
                });
            }

            const docRef = await addDoc(collectionRef, sanitizedAlert);

            // Emergency alert created successfully - logged via ErrorHandler if needed
            return docRef;
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.VALIDATION,
                ErrorSeverity.CRITICAL,
                'SecureFirebaseOperations.secureEmergencyAlertCreation'
            );
            throw error;
        }
    }

    // Log sanitized data for debugging (removes sensitive information)
    static logSanitizedData(data: any, context: string): void {
        try {
            const sanitizedForLogging = DataSanitizer.sanitizeForLogging(data);
            // Only log in development environment
            if (process.env.NODE_ENV === 'development') {
                console.log(`SecureFirebaseOperations [${context}]:`, sanitizedForLogging);
            }
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to sanitize data for logging:', error);
            }
        }
    }
}

// Enhanced Firebase security rules validation
export class EnhancedFirebaseSecurityValidator extends FirebaseSecurityValidator {
    // Validate batch operations
    static validateBatchOperations(
        operations: Array<{
            type: 'set' | 'update' | 'delete';
            ref: DocumentReference;
            data?: any;
        }>,
        userId: string
    ): { isValid: boolean; errors: string[]; sanitizedOperations?: any[] } {
        const errors: string[] = [];
        const sanitizedOperations: any[] = [];

        try {
            for (const operation of operations) {
                const pathParts = operation.ref.path.split('/');
                const collection = pathParts[0];

                // Check permissions
                const hasPermission = this.validateUserPermissions(
                    userId,
                    operation.type === 'delete' ? 'delete' : 'write',
                    collection as any,
                    pathParts[1]
                );

                if (!hasPermission) {
                    errors.push(`No permission for ${operation.type} operation on ${collection}`);
                    continue;
                }

                // Validate and sanitize data for set/update operations
                if (operation.data && (operation.type === 'set' || operation.type === 'update')) {
                    const validation = this.validateFirestoreData(
                        collection,
                        operation.data,
                        userId
                    );

                    if (!validation.isValid) {
                        errors.push(`Invalid data for ${operation.type} operation: ${validation.errors.join(', ')}`);
                        continue;
                    }

                    sanitizedOperations.push({
                        ...operation,
                        data: validation.sanitizedData,
                    });
                } else {
                    sanitizedOperations.push(operation);
                }
            }

            return {
                isValid: errors.length === 0,
                errors,
                sanitizedOperations: errors.length === 0 ? sanitizedOperations : undefined,
            };
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.VALIDATION,
                ErrorSeverity.HIGH,
                'EnhancedFirebaseSecurityValidator.validateBatchOperations'
            );

            return {
                isValid: false,
                errors: ['Batch validation failed'],
            };
        }
    }

    // Enhanced rate limiting check
    static checkOperationRateLimit(
        userId: string,
        operation: string,
        maxOperations: number = 100,
        windowMs: number = 60000
    ): boolean {
        try {
            const key = `rate_limit_${userId}_${operation}`;
            const now = Date.now();

            // Get stored rate limit data
            const stored = localStorage.getItem(key);
            if (!stored) {
                localStorage.setItem(key, JSON.stringify({ count: 1, windowStart: now }));
                return true;
            }

            const data = JSON.parse(stored);

            // Reset if window has passed
            if (now - data.windowStart > windowMs) {
                localStorage.setItem(key, JSON.stringify({ count: 1, windowStart: now }));
                return true;
            }

            // Check if limit exceeded
            if (data.count >= maxOperations) {
                ErrorHandler.logError(
                    new Error(`Rate limit exceeded for ${operation}`),
                    ErrorCategory.VALIDATION,
                    ErrorSeverity.MEDIUM,
                    'EnhancedFirebaseSecurityValidator.checkOperationRateLimit'
                );
                return false;
            }

            // Increment count
            data.count++;
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            ErrorHandler.logError(
                error,
                ErrorCategory.VALIDATION,
                ErrorSeverity.LOW,
                'EnhancedFirebaseSecurityValidator.checkOperationRateLimit'
            );
            return true; // Allow on error to avoid blocking legitimate users
        }
    }
}