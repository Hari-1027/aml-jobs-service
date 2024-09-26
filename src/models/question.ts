import { DataTypes } from 'sequelize';
import { AppDataSource } from '../config';

export const Question = AppDataSource.define(
  'question',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    identifier: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    question_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    question_set_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    benchmark_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    question_type: {
      type: DataTypes.ENUM('Grid-1', 'mcq', 'fib', 'Grid-2'),
      allowNull: false,
    },
    operation: {
      type: DataTypes.ENUM('Addition', 'Subtraction', 'Multiplication', 'Division'),
      allowNull: false,
    },
    name: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    description: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    tenant: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    repository: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    taxonomy: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    gradient: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    hints: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('draft', 'live'),
      allowNull: false,
    },
    media: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      allowNull: false,
    },
    question_body: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    created_by: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    updated_by: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'question',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);
