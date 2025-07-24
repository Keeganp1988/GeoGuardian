import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ErrorBoundary, SafeArrayRenderer, SafeText, SafeView } from '../../components/ErrorBoundary';
import MemberCard from '../../components/MemberCard';
import { Text, View } from 'react-native';

// Mock the error handling utility
jest.mock('../../utils/errorHandling', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
  ErrorCategory: {
    REACT: 'REACT',
    DATA_VALIDATION: 'DATA_VALIDATION',
  },
  ErrorSeverity: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
}));

describe('Null Safety Rendering Tests', () => {
  describe('ErrorBoundary', () => {
    it('should catch and display error when child component throws', () => {
      const ThrowingComponent = () => {
        throw new Error('Test error');
      };

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeTruthy();
      expect(screen.getByText('Test error')).toBeTruthy();
      expect(screen.getByText('Try Again')).toBeTruthy();
    });

    it('should render children normally when no error occurs', () => {
      render(
        <ErrorBoundary>
          <Text>Normal content</Text>
        </ErrorBoundary>
      );

      expect(screen.getByText('Normal content')).toBeTruthy();
    });

    it('should use custom fallback when provided', () => {
      const ThrowingComponent = () => {
        throw new Error('Test error');
      };

      const customFallback = <Text>Custom error message</Text>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeTruthy();
    });
  });

  describe('SafeArrayRenderer', () => {
    const mockRenderItem = (item: any, index: number) => (
      <Text key={index}>Item: {item.name}</Text>
    );

    it('should render items from valid array', () => {
      const data = [
        { name: 'Item 1' },
        { name: 'Item 2' },
        { name: 'Item 3' },
      ];

      render(
        <SafeArrayRenderer
          data={data}
          renderItem={mockRenderItem}
        />
      );

      expect(screen.getByText('Item: Item 1')).toBeTruthy();
      expect(screen.getByText('Item: Item 2')).toBeTruthy();
      expect(screen.getByText('Item: Item 3')).toBeTruthy();
    });

    it('should show empty state for null array', () => {
      render(
        <SafeArrayRenderer
          data={null}
          renderItem={mockRenderItem}
        />
      );

      expect(screen.getByText('No items to display')).toBeTruthy();
    });

    it('should show empty state for undefined array', () => {
      render(
        <SafeArrayRenderer
          data={undefined}
          renderItem={mockRenderItem}
        />
      );

      expect(screen.getByText('No items to display')).toBeTruthy();
    });

    it('should show empty state for empty array', () => {
      render(
        <SafeArrayRenderer
          data={[]}
          renderItem={mockRenderItem}
        />
      );

      expect(screen.getByText('No items to display')).toBeTruthy();
    });

    it('should use custom empty component when provided', () => {
      const customEmpty = <Text>Custom empty state</Text>;

      render(
        <SafeArrayRenderer
          data={[]}
          renderItem={mockRenderItem}
          emptyComponent={customEmpty}
        />
      );

      expect(screen.getByText('Custom empty state')).toBeTruthy();
    });

    it('should handle render errors gracefully', () => {
      const errorRenderItem = (item: any, index: number) => {
        if (index === 1) {
          throw new Error('Render error');
        }
        return <Text key={index}>Item: {item.name}</Text>;
      };

      const data = [
        { name: 'Item 1' },
        { name: 'Item 2' }, // This will cause error
        { name: 'Item 3' },
      ];

      render(
        <SafeArrayRenderer
          data={data}
          renderItem={errorRenderItem}
        />
      );

      expect(screen.getByText('Item: Item 1')).toBeTruthy();
      expect(screen.getByText('Error rendering item')).toBeTruthy();
      expect(screen.getByText('Item: Item 3')).toBeTruthy();
    });
  });

  describe('SafeText', () => {
    it('should render valid text', () => {
      render(<SafeText>Hello World</SafeText>);
      expect(screen.getByText('Hello World')).toBeTruthy();
    });

    it('should render fallback for null text', () => {
      render(<SafeText fallback="Default text">{null}</SafeText>);
      expect(screen.getByText('Default text')).toBeTruthy();
    });

    it('should render fallback for undefined text', () => {
      render(<SafeText fallback="Default text">{undefined}</SafeText>);
      expect(screen.getByText('Default text')).toBeTruthy();
    });

    it('should render empty string for null without fallback', () => {
      render(<SafeText>{null}</SafeText>);
      expect(screen.getByText('')).toBeTruthy();
    });
  });

  describe('SafeView', () => {
    it('should render children normally', () => {
      render(
        <SafeView>
          <Text>Safe content</Text>
        </SafeView>
      );

      expect(screen.getByText('Safe content')).toBeTruthy();
    });

    it('should catch errors in children', () => {
      const ThrowingComponent = () => {
        throw new Error('Child error');
      };

      render(
        <SafeView>
          <ThrowingComponent />
        </SafeView>
      );

      expect(screen.getByText('Error loading content')).toBeTruthy();
    });
  });

  describe('MemberCard with null/undefined props', () => {
    const mockMember = {
      id: 'user1',
      name: 'John Doe',
      avatar: 'https://example.com/avatar.jpg',
      battery: 85,
      isCharging: false,
      location: {
        address: '123 Main St',
        timestamp: new Date(),
        latitude: 40.7128,
        longitude: -74.0060,
        movementType: 'stationary' as const,
      },
      online: true,
    };

    it('should render with complete member data', () => {
      render(<MemberCard member={mockMember} />);
      expect(screen.getByText('John Doe')).toBeTruthy();
      expect(screen.getByText('123 Main St')).toBeTruthy();
    });

    it('should handle missing name gracefully', () => {
      const memberWithoutName = {
        ...mockMember,
        name: undefined as any,
      };

      render(<MemberCard member={memberWithoutName} />);
      // Should not crash and should show some fallback
      expect(screen.queryByText('undefined')).toBeFalsy();
    });

    it('should handle missing location gracefully', () => {
      const memberWithoutLocation = {
        ...mockMember,
        location: null as any,
      };

      render(<MemberCard member={memberWithoutLocation} />);
      expect(screen.getByText('John Doe')).toBeTruthy();
      // Should not crash when location is null
    });

    it('should handle missing location address', () => {
      const memberWithoutAddress = {
        ...mockMember,
        location: {
          ...mockMember.location,
          address: undefined as any,
        },
      };

      render(<MemberCard member={memberWithoutAddress} />);
      expect(screen.getByText('John Doe')).toBeTruthy();
      // Should show fallback address or handle gracefully
    });

    it('should handle null battery level', () => {
      const memberWithNullBattery = {
        ...mockMember,
        battery: null as any,
      };

      render(<MemberCard member={memberWithNullBattery} />);
      expect(screen.getByText('John Doe')).toBeTruthy();
      // Should not crash with null battery
    });
  });

  describe('Array operations in components', () => {
    it('should handle null arrays in map operations', () => {
      const TestComponent = ({ items }: { items: string[] | null }) => (
        <View>
          {(items ?? []).map((item, index) => (
            <Text key={index}>{item}</Text>
          ))}
        </View>
      );

      render(<TestComponent items={null} />);
      // Should not crash
    });

    it('should handle undefined arrays in forEach operations', () => {
      const TestComponent = ({ items }: { items: string[] | undefined }) => {
        const processedItems: string[] = [];
        (items ?? []).forEach(item => {
          processedItems.push(item.toUpperCase());
        });

        return (
          <View>
            {processedItems.map((item, index) => (
              <Text key={index}>{item}</Text>
            ))}
          </View>
        );
      };

      render(<TestComponent items={undefined} />);
      // Should not crash
    });

    it('should handle mixed null/undefined values in arrays', () => {
      const TestComponent = ({ items }: { items: (string | null | undefined)[] }) => (
        <View>
          {(items ?? [])
            .filter(Boolean) // Remove null/undefined values
            .map((item, index) => (
              <Text key={index}>{item}</Text>
            ))}
        </View>
      );

      const mixedArray = ['item1', null, 'item2', undefined, 'item3'];
      render(<TestComponent items={mixedArray} />);

      expect(screen.getByText('item1')).toBeTruthy();
      expect(screen.getByText('item2')).toBeTruthy();
      expect(screen.getByText('item3')).toBeTruthy();
    });
  });

  describe('Nested object access safety', () => {
    it('should handle deeply nested null objects', () => {
      const TestComponent = ({ data }: { data: any }) => (
        <View>
          <Text>{data?.user?.profile?.name ?? 'No name'}</Text>
          <Text>{data?.settings?.notifications?.email ?? 'No email setting'}</Text>
        </View>
      );

      render(<TestComponent data={null} />);
      expect(screen.getByText('No name')).toBeTruthy();
      expect(screen.getByText('No email setting')).toBeTruthy();
    });

    it('should handle partial nested objects', () => {
      const TestComponent = ({ data }: { data: any }) => (
        <View>
          <Text>{data?.user?.profile?.name ?? 'No name'}</Text>
          <Text>{data?.user?.profile?.email ?? 'No email'}</Text>
        </View>
      );

      const partialData = {
        user: {
          profile: {
            name: 'John',
            // email is missing
          }
        }
      };

      render(<TestComponent data={partialData} />);
      expect(screen.getByText('John')).toBeTruthy();
      expect(screen.getByText('No email')).toBeTruthy();
    });
  });
});