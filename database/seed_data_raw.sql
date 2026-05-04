-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 181.214.10.244    Database: ticket_crm
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `system_settings`
--

LOCK TABLES `system_settings` WRITE;
/*!40000 ALTER TABLE `system_settings` DISABLE KEYS */;
INSERT INTO `system_settings` (`setting_key`, `setting_value`, `updated_at`) VALUES ('DEFAULT_QUEUE_ID','4','2026-04-24 16:22:38'),('EMAIL_POLLER_LAST_UID','10406','2026-05-04 10:37:35');
/*!40000 ALTER TABLE `system_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `notification_templates`
--

LOCK TABLES `notification_templates` WRITE;
/*!40000 ALTER TABLE `notification_templates` DISABLE KEYS */;
INSERT INTO `notification_templates` (`id`, `template_key`, `name`, `description`, `subject_template`, `heading`, `body_text`, `footer_text`, `body_html`, `is_active`, `created_at`, `updated_at`) VALUES (1,'ticket_acknowledgement','Ticket Acknowledgement','Sent when a new ticket is created and acknowledged to the customer.','[{{ticket_number}}] {{ticket_subject}}','Ticket Acknowledgement','Your request has been received (Ticket {{ticket_number}}). Our team will respond shortly.','Team Multycomm','<div style=\"font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;\">\n    <h2 style=\"color: #4f8ef7; margin-bottom: 4px;\">Ticket Acknowledgement</h2>\n    <p style=\"color: #64748b; margin-top: 0;\">Your request has been received (Ticket {{ticket_number}}). Our team will respond shortly.</p>\n    <table style=\"width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;\">\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%\"><strong>Ticket Number</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{ticket_number}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Category</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{category}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Priority</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{priority}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>First Response Target</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{first_response_target}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>ETR (Deadline)</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{etr}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b; vertical-align:top\"><strong>Description</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap;\">{{description_html}}</td></tr>\n    </table>\n    <p style=\"font-size: 13px; color: #666;\">To reply or add more details, simply respond to this email - your message will automatically be added to the ticket.</p>\n    {{conversation_trail_html}}\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;\"/>\n    <p style=\"font-size: 12px; color: #999;\">Regards,<br/><strong>{{company_name}}</strong></p>\n  </div>',1,'2026-04-21 18:07:50','2026-04-21 18:09:54'),(2,'ticket_assignment','Ticket Assignment','Sent when a ticket is assigned or reassigned to an owner.','Re: [{{ticket_number}}] {{ticket_subject}}','Agent Assigned to Your Ticket','Good news! Your support request has been assigned to a team member.','Team Multycomm','<div style=\"font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;\">\n    <h2 style=\"color: #4f8ef7; margin-bottom: 4px;\">Agent Assigned to Your Ticket</h2>\n    <p style=\"color: #64748b; margin-top: 0;\">Good news! Your support request has been assigned to a team member.</p>\n    <div style=\"background:#f0fdf4; padding: 15px; border-radius:8px; border:1px solid #bbf7d0; margin: 20px 0;\">\n      <p style=\"margin:0; font-size:14px; color:#166534;\"><strong>{{assigned_to_name}}</strong> has been assigned to handle your ticket <strong>{{ticket_number}}</strong>.</p>\n    </div>\n    <table style=\"width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;\">\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%\"><strong>Ticket Number</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{ticket_number}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Subject</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{ticket_subject}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Assigned To</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{assigned_to_name}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>ETR (Deadline)</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{etr}}</td></tr>\n    </table>\n    <p style=\"font-size: 13px; color: #666;\">To add more details, simply reply to this email.</p>\n    {{conversation_trail_html}}\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;\"/>\n    <p style=\"font-size: 12px; color: #999;\">Regards,<br/><strong>{{company_name}}</strong></p>\n  </div>',1,'2026-04-21 18:07:50','2026-04-21 18:09:54'),(3,'sla_breach','SLA Breach','Sent when a ticket breaches the configured resolution SLA.','Re: [{{ticket_number}}] {{ticket_subject}}','Ticket Escalated','We sincerely apologize ΓÇö your support request has exceeded its expected resolution time.','Team Multycomm','<div style=\"font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;\">\n    <h2 style=\"color: #dc2626; margin-bottom: 4px;\">Ticket Escalated</h2>\n    <p style=\"color: #64748b; margin-top: 0;\">We sincerely apologize - your support request has exceeded its expected resolution time.</p>\n    <div style=\"background:#fef2f2; padding: 15px; border-radius:8px; border:1px solid #fecaca; margin: 20px 0;\">\n      <p style=\"margin:0; font-size:14px; color:#991b1b;\">Your ticket <strong>{{ticket_number}}</strong> has been automatically escalated for priority resolution.</p>\n    </div>\n    <table style=\"width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;\">\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%\"><strong>Ticket Number</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{ticket_number}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Subject</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{ticket_subject}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Priority</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{priority}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Assigned To</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{assigned_to_name}}</td></tr>\n      <tr><td style=\"padding: 8px; border-bottom: 1px solid #eee; color: #64748b;\"><strong>Original Deadline</strong></td><td style=\"padding: 8px; border-bottom: 1px solid #eee;\">{{etr}}</td></tr>\n    </table>\n    <p style=\"font-size: 13px; color: #666;\">We are working to resolve your issue as quickly as possible.</p>\n    {{conversation_trail_html}}\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;\"/>\n    <p style=\"font-size: 12px; color: #999;\">Regards,<br/><strong>{{company_name}}</strong></p>\n  </div>',1,'2026-04-21 18:07:50','2026-04-28 15:18:45');
/*!40000 ALTER TABLE `notification_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `sla_priority_categories`
--

LOCK TABLES `sla_priority_categories` WRITE;
/*!40000 ALTER TABLE `sla_priority_categories` DISABLE KEYS */;
INSERT INTO `sla_priority_categories` (`id`, `name`, `prefix`, `sort_order`, `is_active`, `created_at`) VALUES (1,'Critical','P',1,1,'2026-04-17 17:34:36'),(2,'High','Q',2,1,'2026-04-17 17:34:36'),(3,'Medium','R',3,1,'2026-04-17 17:34:36'),(4,'Low','S',4,1,'2026-04-17 17:34:36');
/*!40000 ALTER TABLE `sla_priority_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `priorities`
--

LOCK TABLES `priorities` WRITE;
/*!40000 ALTER TABLE `priorities` DISABLE KEYS */;
INSERT INTO `priorities` (`id`, `name`, `color_code`, `created_at`, `category_id`, `level`, `is_active`) VALUES (1,'P1','#ef4444','2026-04-17 17:26:42',1,1,1),(2,'Q1','#f97316','2026-04-17 17:26:42',2,1,1),(3,'R1','#3b82f6','2026-04-17 17:26:42',3,1,1),(4,'S1','#10b981','2026-04-17 17:26:42',4,1,1),(14,'P3','#64748b','2026-04-20 12:20:49',1,3,0),(16,'P2','#64748b','2026-04-20 12:39:25',1,2,1),(17,'Q1','#64748b','2026-04-20 12:40:12',2,2,0),(21,'R2','#64748b','2026-04-21 00:19:34',3,2,1),(24,'Q1','#64748b','2026-04-22 18:12:32',2,3,1);
/*!40000 ALTER TABLE `priorities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `sla_policies`
--

LOCK TABLES `sla_policies` WRITE;
/*!40000 ALTER TABLE `sla_policies` DISABLE KEYS */;
INSERT INTO `sla_policies` (`id`, `priority`, `resolution_time_hours`, `response_time_sec`, `response_time_min`, `escalation_1_min`, `escalation_2_min`, `escalation_3_min`, `updated_at`) VALUES (1,'P1',3.00,900,15,30,15,15,'2026-03-16 18:13:18'),(2,'P2',12.00,900,15,60,30,15,'2026-03-16 18:12:46'),(3,'P3',24.00,900,15,120,60,30,'2026-03-16 18:12:27'),(4,'P4',48.00,900,15,360,180,90,'2026-03-16 18:09:49'),(5,'P5',72.00,900,15,2880,1440,720,'2026-03-16 18:08:36');
/*!40000 ALTER TABLE `sla_policies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `sla_policies_new`
--

LOCK TABLES `sla_policies_new` WRITE;
/*!40000 ALTER TABLE `sla_policies_new` DISABLE KEYS */;
INSERT INTO `sla_policies_new` (`id`, `name`, `customer_id`, `project_id`, `priority_id`, `first_response_hrs`, `resolution_hrs`, `version`, `is_active`, `created_at`, `escalation_1_min`, `escalation_2_min`, `escalation_3_min`) VALUES (1,'Global Default - P1',NULL,NULL,1,0.25,1.00,1,1,'2026-04-20 11:42:52',15,30,45),(2,'Global Default - Q1',NULL,NULL,2,1.00,4.00,1,1,'2026-04-20 11:42:52',60,120,180),(3,'Global Default - R1',NULL,NULL,3,1.00,4.00,1,1,'2026-04-20 11:42:52',60,120,180),(4,'Global Default - S1',NULL,NULL,4,1.00,4.00,1,1,'2026-04-20 11:42:52',60,120,180),(9,'Global Default - P3',NULL,NULL,14,1.00,5.00,1,0,'2026-04-20 12:20:49',60,120,180),(10,'Global Default - P2',NULL,NULL,16,0.33,2.00,1,1,'2026-04-20 12:39:25',20,40,60),(11,'Global Default - Q1',NULL,NULL,17,1.00,5.00,1,0,'2026-04-20 12:40:12',70,140,210),(12,'Override - Customer 1 - Prio 1',1,NULL,1,0.25,1.00,1,1,'2026-04-20 13:01:51',15,30,45),(13,'Override - Customer 1 - Prio 16',1,NULL,16,0.33,2.00,1,1,'2026-04-20 13:01:51',20,40,60),(14,'Override - Customer 1 - Prio 2',1,NULL,2,1.00,4.00,1,1,'2026-04-20 13:01:51',60,120,180),(15,'Override - Customer 1 - Prio 3',1,NULL,3,1.00,4.00,1,1,'2026-04-20 13:01:51',60,120,180),(16,'Override - Customer 1 - Prio 4',1,NULL,4,1.00,4.00,1,1,'2026-04-20 13:01:51',60,120,180),(17,'Global Default - R2',NULL,NULL,21,1.00,4.00,1,1,'2026-04-21 00:19:34',60,120,180),(18,'Override - Customer 2 - Prio 1',2,NULL,1,0.17,1.00,1,1,'2026-04-21 23:18:58',15,30,45),(19,'Override - Customer 2 - Prio 16',2,NULL,16,0.25,2.00,1,1,'2026-04-21 23:18:58',20,40,60),(20,'Override - Customer 2 - Prio 2',2,NULL,2,0.42,3.00,1,1,'2026-04-21 23:18:58',60,120,180),(21,'Override - Customer 2 - Prio 3',2,NULL,3,1.00,4.00,1,1,'2026-04-21 23:18:58',60,120,180),(22,'Override - Customer 2 - Prio 21',2,NULL,21,1.00,4.00,1,1,'2026-04-21 23:18:58',60,120,180),(23,'Override - Customer 2 - Prio 4',2,NULL,4,1.00,4.00,1,1,'2026-04-21 23:18:58',60,120,180),(24,'Override - Customer 3 - Prio 1',3,NULL,1,0.25,1.00,1,1,'2026-04-22 11:08:56',15,30,45),(25,'Override - Customer 3 - Prio 16',3,NULL,16,0.33,2.00,1,1,'2026-04-22 11:08:56',20,40,60),(26,'Override - Customer 3 - Prio 2',3,NULL,2,1.00,3.00,1,1,'2026-04-22 11:08:56',60,120,180),(27,'Override - Customer 3 - Prio 3',3,NULL,3,1.00,4.00,1,1,'2026-04-22 11:08:56',60,120,180),(28,'Override - Customer 3 - Prio 21',3,NULL,21,1.00,4.00,1,1,'2026-04-22 11:08:56',60,120,180),(29,'Override - Customer 3 - Prio 4',3,NULL,4,1.00,4.00,1,1,'2026-04-22 11:08:56',60,120,180),(30,'Global Default - Q1',NULL,NULL,24,1.00,5.00,1,1,'2026-04-22 18:12:32',60,120,180),(31,'Override - Customer 4 - Prio 1',4,NULL,1,0.25,1.00,1,1,'2026-04-22 18:54:34',15,30,45),(32,'Override - Customer 4 - Prio 16',4,NULL,16,0.33,2.00,1,1,'2026-04-22 18:54:34',20,40,60),(33,'Override - Customer 4 - Prio 2',4,NULL,2,1.00,4.00,1,1,'2026-04-22 18:54:34',60,120,180),(34,'Override - Customer 4 - Prio 3',4,NULL,3,1.00,4.00,1,1,'2026-04-22 18:54:34',60,120,180),(35,'Override - Customer 4 - Prio 21',4,NULL,21,1.00,4.00,1,1,'2026-04-22 18:54:34',60,120,180),(36,'Override - Customer 4 - Prio 4',4,NULL,4,1.00,4.00,1,1,'2026-04-22 18:54:34',60,120,180),(37,'Override - Customer 5 - Prio 1',5,NULL,1,0.25,1.00,1,1,'2026-04-24 19:06:32',15,30,45),(38,'Override - Customer 5 - Prio 16',5,NULL,16,0.33,2.00,1,1,'2026-04-24 19:06:32',20,40,60),(39,'Override - Customer 5 - Prio 2',5,NULL,2,1.00,4.00,1,1,'2026-04-24 19:06:32',60,120,180),(40,'Override - Customer 5 - Prio 24',5,NULL,24,1.00,5.00,1,1,'2026-04-24 19:06:32',60,120,180),(41,'Override - Customer 5 - Prio 3',5,NULL,3,1.00,4.00,1,1,'2026-04-24 19:06:32',60,120,180),(42,'Override - Customer 5 - Prio 21',5,NULL,21,1.00,4.00,1,1,'2026-04-24 19:06:32',60,120,180),(43,'Override - Customer 5 - Prio 4',5,NULL,4,1.00,4.00,1,1,'2026-04-24 19:06:32',60,120,180),(44,'Override - Customer 6 - Prio 1',6,NULL,1,0.25,1.00,1,1,'2026-04-24 19:13:38',15,30,45),(45,'Override - Customer 6 - Prio 16',6,NULL,16,0.33,2.00,1,1,'2026-04-24 19:13:38',20,40,60),(46,'Override - Customer 6 - Prio 2',6,NULL,2,1.00,4.00,1,1,'2026-04-24 19:13:38',60,120,180),(47,'Override - Customer 6 - Prio 24',6,NULL,24,1.00,5.00,1,1,'2026-04-24 19:13:38',60,120,180),(48,'Override - Customer 6 - Prio 3',6,NULL,3,1.00,4.00,1,1,'2026-04-24 19:13:38',60,120,180),(49,'Override - Customer 6 - Prio 21',6,NULL,21,1.00,4.00,1,1,'2026-04-24 19:13:38',60,120,180),(50,'Override - Customer 6 - Prio 4',6,NULL,4,1.00,4.00,1,1,'2026-04-24 19:13:38',60,120,180);
/*!40000 ALTER TABLE `sla_policies_new` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `sla_business_hours`
--

LOCK TABLES `sla_business_hours` WRITE;
/*!40000 ALTER TABLE `sla_business_hours` DISABLE KEYS */;
INSERT INTO `sla_business_hours` (`id`, `calendar_id`, `day_of_week`, `start_time`, `end_time`) VALUES (6,1,'Mon','09:00:00','18:00:00'),(7,1,'Tue','09:00:00','18:00:00'),(8,1,'Wed','09:00:00','18:00:00'),(9,1,'Thu','09:00:00','18:00:00'),(10,1,'Fri','09:00:00','18:00:00');
/*!40000 ALTER TABLE `sla_business_hours` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `sla_calendars`
--

LOCK TABLES `sla_calendars` WRITE;
/*!40000 ALTER TABLE `sla_calendars` DISABLE KEYS */;
INSERT INTO `sla_calendars` (`id`, `name`, `timezone`, `is_default`, `created_at`) VALUES (1,'Standard Business Hours','Asia/Calcutta',1,'2026-04-17 17:27:09');
/*!40000 ALTER TABLE `sla_calendars` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `sla_holidays`
--

LOCK TABLES `sla_holidays` WRITE;
/*!40000 ALTER TABLE `sla_holidays` DISABLE KEYS */;
/*!40000 ALTER TABLE `sla_holidays` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `holidays`
--

LOCK TABLES `holidays` WRITE;
/*!40000 ALTER TABLE `holidays` DISABLE KEYS */;
INSERT INTO `holidays` (`id`, `holiday_date`, `description`, `created_by`, `created_at`) VALUES (1,'2026-03-20','asdlla',1,'2026-03-16 21:58:58');
/*!40000 ALTER TABLE `holidays` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `shifts`
--

LOCK TABLES `shifts` WRITE;
/*!40000 ALTER TABLE `shifts` DISABLE KEYS */;
INSERT INTO `shifts` (`id`, `name`, `start_time`, `end_time`, `shift_type`, `working_days`, `created_by`, `created_at`, `updated_at`) VALUES (1,'one shift','09:00:00','10:00:00','general','[\"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\", \"Sun\"]',1,'2026-03-16 21:57:20','2026-04-09 15:03:49'),(2,'2nd shift','18:00:00','12:00:00','rotational','[\"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\", \"Sun\"]',1,'2026-03-16 21:58:06','2026-03-16 21:58:06'),(3,'3rd shift','00:00:00','08:00:00','night','[\"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\", \"Sun\"]',1,'2026-03-16 21:58:36','2026-03-16 21:58:36'),(4,'Weekend Shift','08:00:00','11:59:00','general','[\"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\", \"Sun\"]',1,'2026-04-08 15:57:21','2026-04-09 15:23:51'),(5,'Wednesday_Shivam','16:00:00','18:00:00','general','[]',1,'2026-04-08 16:01:16','2026-04-09 15:02:46'),(6,'ShivamShift','09:00:00','18:00:00','general','[\"Thu\"]',1,'2026-04-09 15:02:23','2026-04-09 15:02:23'),(7,'new shit test Akash ','13:00:00','18:00:00','general','[\"Thu\", \"Fri\", \"Sat\", \"Sun\", \"Wed\", \"Tue\", \"Mon\"]',1,'2026-04-14 13:27:27','2026-04-14 13:27:27'),(8,'khushboo testing shift','09:00:00','02:00:00','general','[\"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\", \"Sun\"]',1,'2026-04-20 17:47:01','2026-04-22 00:02:38');
/*!40000 ALTER TABLE `shifts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `shift_members`
--

LOCK TABLES `shift_members` WRITE;
/*!40000 ALTER TABLE `shift_members` DISABLE KEYS */;
INSERT INTO `shift_members` (`id`, `shift_id`, `user_id`, `role`) VALUES (5,6,11,'agent'),(6,5,11,'agent'),(9,4,7,'agent'),(10,1,5,'agent'),(11,2,12,'agent'),(12,7,7,'agent'),(15,8,15,'agent');
/*!40000 ALTER TABLE `shift_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `agent_shifts`
--

LOCK TABLES `agent_shifts` WRITE;
/*!40000 ALTER TABLE `agent_shifts` DISABLE KEYS */;
INSERT INTO `agent_shifts` (`id`, `name`, `start_time`, `end_time`, `days_of_week`, `is_active`, `created_at`, `updated_at`) VALUES (1,'General Shift','00:00:00','23:59:59','SUN,MON,TUE,WED,THU,FRI,SAT',1,'2026-04-08 13:30:45','2026-04-13 12:21:35');
/*!40000 ALTER TABLE `agent_shifts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `queues`
--

LOCK TABLES `queues` WRITE;
/*!40000 ALTER TABLE `queues` DISABLE KEYS */;
INSERT INTO `queues` (`id`, `name`, `type`, `priority`, `sla_hours`, `description`, `created_by`, `created_at`, `updated_at`) VALUES (1,'P1','pull',1,6.00,'Priority 1(Top-most)',1,'2026-03-16 18:30:37','2026-04-08 16:03:55'),(2,'Emergency','pull',1,24.00,'emergency queue for support\n',1,'2026-04-14 17:34:35','2026-04-14 17:34:35'),(3,'Express ','push',1,24.00,'for high priorty queue',1,'2026-04-20 13:08:22','2026-04-20 13:08:22'),(4,'Medium Priorty ticket','push',3,24.00,'medium priorty ticket auto assignment',1,'2026-04-20 17:31:56','2026-04-20 17:31:56'),(6,'khushboo testing queue','push',3,24.00,'testingg',1,'2026-04-21 23:06:32','2026-04-21 23:36:40');
/*!40000 ALTER TABLE `queues` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `workflow_rules`
--

LOCK TABLES `workflow_rules` WRITE;
/*!40000 ALTER TABLE `workflow_rules` DISABLE KEYS */;
INSERT INTO `workflow_rules` (`id`, `name`, `description`, `trigger_event`, `priority`, `conditions`, `actions`, `is_active`, `created_by`, `created_at`, `updated_at`) VALUES (1,'TIK00000-000001',NULL,'ticket_created',0,'{\"source\": \"manual\"}','[{\"type\": \"assign_to\", \"value\": \"\"}]',1,1,'2026-03-16 22:00:11','2026-03-16 22:00:11'),(2,'Web00000-00001',NULL,'ticket_created',-1,'{\"source\": \"email\"}','[{\"type\": \"update_status\", \"value\": \"in_progress\"}]',1,1,'2026-03-16 22:00:55','2026-04-24 16:22:38'),(3,'P2 queue assignment',NULL,'ticket_created',10,'{\"priority\": \"P2\"}','[{\"type\": \"route_to_queue\", \"value\": \"3\"}]',1,1,'2026-04-20 15:54:57','2026-04-24 16:22:38'),(4,'medium priority ticket assigned',NULL,'ticket_created',10,'{\"priority\": \"R2\"}','[{\"type\": \"route_to_queue\", \"value\": \"6\"}]',1,1,'2026-04-20 17:33:13','2026-04-24 16:22:38');
/*!40000 ALTER TABLE `workflow_rules` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-04 10:48:38
