import { Router, type IRouter } from "express";
import healthRouter from "./health";
import phoneRouter from "./phone";
import adminRouter from "./admin";
import setupRouter from "./setup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(phoneRouter);
router.use(adminRouter);
router.use(setupRouter);

export default router;
