<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

// In-app notification (the `notifications` table, read through $user->notifications() - never DatabaseNotification::all())
class GeneralNotification extends Notification
{
    public function __construct(private string $title, private string $body, private string $type, private array $data = []) {}

    public function via(object $notifiable): array { return ['database']; }

    public function toArray(object $notifiable): array
    {
        return ['type' => $this->type, 'title' => $this->title, 'body' => $this->body, 'data' => $this->data];
    }
}
