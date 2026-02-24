import { CreateJobInput, JobPriority, JobStatus, JobType, WorkOrder } from '../types';

// DELIVERABLE 4: "CreateJob" Server Action Logic
// In a real Next.js app, this would be in `app/actions/createJob.ts` marked with "use server"

/**
 * Simulates a Next.js Server Action to create a job.
 * Handles validation, linking customers/assets, and DB insertion.
 */
export const createJobAction = async (input: CreateJobInput): Promise<{ success: boolean; data?: WorkOrder; error?: string }> => {
  console.log("SERVER ACTION: Received input", input);

  // 1. Validation Layer (Zod would be used here usually)
  if (!input.customerId) {
    return { success: false, error: "Customer is required." };
  }
  if (!input.description || input.description.length < 5) {
    return { success: false, error: "Description must be at least 5 characters." };
  }

  // 2. Simulate DB Latency
  await new Promise(resolve => setTimeout(resolve, 800));

  // 3. Mock Database Insertion logic
  // const job = await db.insert(workOrders).values({ ...input, status: 'OPEN' }).returning();
  
  const mockNewJob: WorkOrder = {
    id: `WO-${Math.floor(Math.random() * 10000)}`,
    organization_id: 'demo-org',
    customer_id: input.customerId,
    asset_id: input.assetId ?? null,
    assigned_to_user_id: input.assignedTechnicianId ?? null,
    status: JobStatus.OPEN, // Default status
    priority: input.priority || JobPriority.NORMAL,
    job_type: input.jobType ?? JobType.FIELD,
    title: input.title ?? input.description.slice(0, 80),
    description: input.description,
    scheduled_start: new Date().toISOString(),
    scheduled_end: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    time_log: [],
    parts_used: [],
  };

  console.log("SERVER ACTION: Job Created Successfully", mockNewJob);

  // 4. Return serialized data (Next.js Server Action requirement)
  return { success: true, data: mockNewJob };
};
