import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import { DataSanitizer } from '../utils/dataSanitizer';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  context?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

/**
 * Error boundary component with null safety error handling
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Check for forEach null reference errors
    if (error.message && error.message.includes('Cannot read property \'forEach\' of null')) {
      console.log('🔍 ErrorBoundary caught forEach null error:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        context: this.props.context
      });
    }

    // Log error with context
    ErrorHandler.logError(
      error,
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      `ErrorBoundary${this.props.context ? ` in ${this.props.context}` : ''}`
    );

    // Call custom error handler if provided
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (handlerError) {
        ErrorHandler.logError(
          handlerError,
          ErrorCategory.UNKNOWN,
          ErrorSeverity.MEDIUM,
          'ErrorBoundary onError handler'
        );
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

interface SafeArrayRendererProps<T> {
  data: T[] | null | undefined;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  emptyComponent?: ReactNode;
  errorComponent?: ReactNode;
  context?: string;
}

/**
 * Safe array renderer component that handles null/undefined arrays gracefully
 */
export function SafeArrayRenderer<T>({
  data,
  renderItem,
  keyExtractor,
  emptyComponent,
  errorComponent,
  context
}: SafeArrayRendererProps<T>) {
  try {
    const safeData = DataSanitizer.getSafeArray(data, context);

    if (safeData.length === 0) {
      return (
        <>
          {emptyComponent || (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No items to display</Text>
            </View>
          )}
        </>
      );
    }

    return (
      <ErrorBoundary context={`SafeArrayRenderer${context ? ` in ${context}` : ''}`}>
        {safeData.map((item, index) => {
          try {
            const key = keyExtractor ? keyExtractor(item, index) : `item-${index}`;
            return (
              <View key={key}>
                {renderItem(item, index)}
              </View>
            );
          } catch (error) {
            ErrorHandler.logError(
              error,
              ErrorCategory.UNKNOWN,
              ErrorSeverity.LOW,
              `SafeArrayRenderer renderItem at index ${index}${context ? ` in ${context}` : ''}`
            );
            
            return (
              <View key={`error-${index}`} style={styles.itemErrorContainer}>
                <Text style={styles.itemErrorText}>Error rendering item</Text>
              </View>
            );
          }
        })}
      </ErrorBoundary>
    );
  } catch (error) {
    ErrorHandler.logError(
      error,
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      `SafeArrayRenderer${context ? ` in ${context}` : ''}`
    );

    return (
      <>
        {errorComponent || (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error displaying list</Text>
          </View>
        )}
      </>
    );
  }
}

interface SafeTextProps {
  children: string | null | undefined;
  fallback?: string;
  style?: any;
}

/**
 * Safe text component that handles null/undefined text gracefully
 */
export function SafeText({ children, fallback = '', style }: SafeTextProps) {
  const safeText = typeof children === 'string' ? children : fallback;
  return <Text style={style}>{safeText}</Text>;
}

interface SafeViewProps {
  children: ReactNode;
  style?: any;
  fallback?: ReactNode;
  context?: string;
}

/**
 * Safe view component with error boundary
 */
export function SafeView({ children, style, fallback, context }: SafeViewProps) {
  return (
    <ErrorBoundary 
      context={context}
      fallback={fallback || (
        <View style={[style, styles.errorContainer]}>
          <Text style={styles.errorText}>Error loading content</Text>
        </View>
      )}
    >
      <View style={style}>
        {children}
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#dc3545',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
  },
  itemErrorContainer: {
    padding: 10,
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    marginVertical: 2,
  },
  itemErrorText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
  },
});

export default ErrorBoundary;