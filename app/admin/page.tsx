'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';

export default function AdminBackupPage() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backups, setBackups] = useState<Array<{ name: string, path: string, created: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Backup created',
          description: `Backup created successfully at ${data.path}`,
          variant: 'default',
        });
        // Refresh backup list
        fetchBackups();
      } else {
        throw new Error(data.error || 'Failed to create backup');
      }
    } catch (error) {
      console.error('Backup failed:', error);
      toast({
        title: 'Backup failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/backup');
      const data = await response.json();
      if (data.backups) {
        setBackups(data.backups);
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error);
      toast({
        title: 'Failed to load backups',
        description: 'Could not load backup list',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load backups on component mount
  useEffect(() => {
    fetchBackups();
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">System Backup</h1>
        <Button
          onClick={handleCreateBackup}
          disabled={isBackingUp}
          className="bg-green-600 hover:bg-green-700"
        >
          {isBackingUp ? 'Creating Backup...' : 'Create New Backup'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Backups</CardTitle>
          <CardDescription>
            Manage your system backups. Backups include database, prompt templates, and vector indexes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No backups available. Create your first backup to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {backups.map((backup, index) => (
                <div key={index} className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{backup.name}</h3>
                    <p className="text-sm text-gray-500">
                      Created: {new Date(backup.created).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <a
                      href={`/api/backup/download?file=${encodeURIComponent(backup.name)}`}
                      download
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Download
                    </a>
                    <Button variant="outline" size="sm">
                      Restore
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
