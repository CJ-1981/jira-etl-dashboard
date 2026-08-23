import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search } from 'lucide-react';

/** Persistent empty state shown when the last extraction returned no issues. */
export const EmptyExtractionCard = React.memo(function EmptyExtractionCard() {
  return (
    <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-500/5">
      <CardContent className="py-8">
        <div className="text-center">
          <Search className="h-12 w-12 mx-auto mb-3 text-amber-400 opacity-50" />
          <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-300 mb-2">No Issues Found</h3>
          <p className="text-sm text-amber-700 dark:text-amber-400 max-w-md mx-auto">
            No tickets matched your extraction criteria. Try adjusting your JQL query, expanding the date range, or verifying the project key.
          </p>
        </div>
      </CardContent>
    </Card>
  );
});
