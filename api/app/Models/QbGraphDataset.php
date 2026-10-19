<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// D115 (R2.1.2): a graph's table of numbers (qbank's graph_datasets), part of the platform question bank
class QbGraphDataset extends Model
{
    use PlatformCatalogue, SoftDeletes;

    public const TENANT_READ = 'all';   // read-only from an institution's host
    public const MAX_ROWS = 50000;
    public const MAX_COLUMNS = 80;
    public const MAX_CELLS = 1000000;
    public const MAX_CELL_LENGTH = 2048;

    protected $table = 'qb_graph_datasets';

    protected $fillable = ['uuid', 'qb_question_id', 'name', 'source_type', 'headers', 'row_count', 'column_count', 'checksum', 'version', 'rows_json', 'metadata', 'created_by'];

    protected $casts = ['headers' => 'array', 'metadata' => 'array'];
}
